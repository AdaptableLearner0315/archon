/**
 * Refund credits for failed agents in a team task.
 * Called when some agents fail but others succeed.
 *
 * @param p_company_id - The company to refund
 * @param p_team_task_id - The team task
 * @param p_failed_roles - Array of agent roles that failed
 * @returns success, refunded_amount, new_balance
 */
CREATE OR REPLACE FUNCTION refund_team_credits(
  p_company_id UUID,
  p_team_task_id UUID,
  p_failed_roles TEXT[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
  v_refund_amount INTEGER := 0;
  v_agent_cost INTEGER;
  v_role TEXT;
  v_new_balance INTEGER;
BEGIN
  -- Lock the balance row
  SELECT balance INTO v_balance
  FROM credit_balances
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No balance found', 'refunded', 0);
  END IF;

  -- Calculate refund amount for failed agents
  FOREACH v_role IN ARRAY p_failed_roles LOOP
    SELECT COALESCE(base_cost, 10) INTO v_agent_cost
    FROM agent_credit_costs
    WHERE agent_role = v_role;

    v_refund_amount := v_refund_amount + COALESCE(v_agent_cost, 10);
  END LOOP;

  -- Add refund to balance
  v_new_balance := v_balance + v_refund_amount;

  UPDATE credit_balances
  SET balance = v_new_balance,
      lifetime_used = GREATEST(0, lifetime_used - v_refund_amount),
      updated_at = NOW()
  WHERE company_id = p_company_id;

  -- Update reservation record
  UPDATE team_credit_reservations
  SET refunded = refunded + v_refund_amount
  WHERE team_task_id = p_team_task_id;

  -- Log refund transaction
  INSERT INTO credit_transactions (company_id, type, amount, balance_after, description)
  VALUES (
    p_company_id,
    'refund',
    v_refund_amount,
    v_new_balance,
    'Team task refund for ' || array_length(p_failed_roles, 1) || ' failed agents'
  );

  RETURN json_build_object(
    'success', true,
    'refunded', v_refund_amount,
    'new_balance', v_new_balance
  );
END;
$$;
