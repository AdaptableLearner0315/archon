/**
 * Atomic credit reservation for team tasks.
 * Locks the balance row, calculates total cost, deducts atomically.
 *
 * @param p_company_id - The company to charge
 * @param p_team_task_id - The team task being executed
 * @param p_agent_roles - Array of agent roles (2-4 agents)
 * @returns success, new_balance, reserved_amount, error
 */
CREATE OR REPLACE FUNCTION reserve_credits_for_team(
  p_company_id UUID,
  p_team_task_id UUID,
  p_agent_roles TEXT[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
  v_total_cost INTEGER := 0;
  v_agent_cost INTEGER;
  v_role TEXT;
  v_new_balance INTEGER;
BEGIN
  -- Lock the balance row to prevent race conditions
  SELECT balance INTO v_balance
  FROM credit_balances
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No credit balance found',
      'new_balance', 0,
      'reserved', 0
    );
  END IF;

  -- Calculate total cost for all agents
  FOREACH v_role IN ARRAY p_agent_roles LOOP
    SELECT COALESCE(base_cost, 10) INTO v_agent_cost
    FROM agent_credit_costs
    WHERE agent_role = v_role;

    IF v_agent_cost IS NULL THEN
      v_agent_cost := 10; -- Default fallback
    END IF;

    v_total_cost := v_total_cost + v_agent_cost;
  END LOOP;

  -- Check sufficient balance
  IF v_balance < v_total_cost THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Insufficient credits. Need ' || v_total_cost || ', have ' || v_balance,
      'new_balance', v_balance,
      'reserved', 0
    );
  END IF;

  -- Deduct atomically
  v_new_balance := v_balance - v_total_cost;

  UPDATE credit_balances
  SET balance = v_new_balance,
      lifetime_used = lifetime_used + v_total_cost,
      updated_at = NOW()
  WHERE company_id = p_company_id;

  -- Log the reservation
  INSERT INTO team_credit_reservations (team_task_id, company_id, total_reserved, agents_charged)
  VALUES (p_team_task_id, p_company_id, v_total_cost, p_agent_roles);

  -- Log transaction
  INSERT INTO credit_transactions (company_id, type, amount, balance_after, description)
  VALUES (
    p_company_id,
    'task_usage',
    -v_total_cost,
    v_new_balance,
    'Team task reservation for ' || array_length(p_agent_roles, 1) || ' agents'
  );

  RETURN json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'reserved', v_total_cost,
    'error', NULL
  );
END;
$$;
