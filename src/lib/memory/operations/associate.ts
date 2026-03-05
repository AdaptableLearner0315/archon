/**
 * Memory Association Operation
 *
 * Connects related memories across domains to enable cross-domain reasoning.
 * Manages memory relationships: supports, contradicts, elaborates, derives_from, related_to.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyMemory, MemoryAssociation, MemoryAssociationType, MemoryDomain } from '../../types';
import { generateEmbedding, cosineSimilarity, isEmbeddingsAvailable } from '../embeddings';

interface AssociationCreateInput {
  companyId: string;
  memoryAId: string;
  memoryBId: string;
  relationshipType: MemoryAssociationType;
  strength?: number;
  createdBy?: string;
}

/**
 * Create an association between two memories.
 */
export async function createAssociation(
  supabase: SupabaseClient,
  input: AssociationCreateInput
): Promise<MemoryAssociation | null> {
  const { companyId, memoryAId, memoryBId, relationshipType, strength = 0.5, createdBy } = input;

  // Don't create self-associations
  if (memoryAId === memoryBId) return null;

  const { data, error } = await supabase
    .from('memory_associations')
    .insert({
      company_id: companyId,
      memory_a_id: memoryAId,
      memory_b_id: memoryBId,
      relationship_type: relationshipType,
      strength,
      created_by: createdBy ?? 'system',
    })
    .select()
    .single();

  if (error) {
    // Duplicate associations are expected, don't log as error
    if (error.code === '23505') return null;
    console.error('[Associate] Failed to create association:', error);
    return null;
  }

  return mapAssociation(data);
}

/**
 * Find associations for a given memory.
 */
export async function getAssociations(
  supabase: SupabaseClient,
  memoryId: string,
  options: {
    relationshipType?: MemoryAssociationType;
    minStrength?: number;
  } = {}
): Promise<MemoryAssociation[]> {
  const { relationshipType, minStrength = 0 } = options;

  let query = supabase
    .from('memory_associations')
    .select('*')
    .or(`memory_a_id.eq.${memoryId},memory_b_id.eq.${memoryId}`)
    .gte('strength', minStrength);

  if (relationshipType) {
    query = query.eq('relationship_type', relationshipType);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map(mapAssociation);
}

/**
 * Auto-detect associations for a new memory based on semantic similarity.
 * Called after encoding a new memory.
 */
export async function autoAssociate(
  supabase: SupabaseClient,
  newMemory: CompanyMemory,
  options: {
    similarityThreshold?: number;
    maxAssociations?: number;
  } = {}
): Promise<MemoryAssociation[]> {
  const { similarityThreshold = 0.7, maxAssociations = 5 } = options;

  // Skip if embeddings not available
  if (!isEmbeddingsAvailable()) return [];

  // Generate embedding for the new memory
  const newEmbedding = await generateEmbedding(`${newMemory.topic}\n\n${newMemory.content}`);
  if (!newEmbedding) return [];

  // Find semantically similar memories
  const { data: candidates } = await supabase
    .from('company_memories')
    .select('id, topic, content, domain, embedding')
    .eq('company_id', newMemory.companyId)
    .neq('id', newMemory.id)
    .eq('is_archived', false)
    .not('embedding', 'is', null)
    .limit(100);

  if (!candidates || candidates.length === 0) return [];

  // Calculate similarities and filter
  const similar: { id: string; domain: MemoryDomain; similarity: number }[] = [];

  for (const candidate of candidates) {
    if (!candidate.embedding) continue;

    const similarity = cosineSimilarity(newEmbedding, candidate.embedding as number[]);

    if (similarity >= similarityThreshold) {
      similar.push({
        id: candidate.id,
        domain: candidate.domain as MemoryDomain,
        similarity,
      });
    }
  }

  // Sort by similarity and take top N
  similar.sort((a, b) => b.similarity - a.similarity);
  const topSimilar = similar.slice(0, maxAssociations);

  // Create associations
  const associations: MemoryAssociation[] = [];

  for (const match of topSimilar) {
    // Determine relationship type based on domain
    const relationshipType: MemoryAssociationType =
      match.domain === newMemory.domain ? 'elaborates' : 'related_to';

    const association = await createAssociation(supabase, {
      companyId: newMemory.companyId,
      memoryAId: newMemory.id,
      memoryBId: match.id,
      relationshipType,
      strength: match.similarity,
      createdBy: 'system',
    });

    if (association) {
      associations.push(association);
    }
  }

  return associations;
}

/**
 * Get all contradicting memory pairs for a company.
 */
export async function getContradictions(
  supabase: SupabaseClient,
  companyId: string
): Promise<MemoryAssociation[]> {
  const { data, error } = await supabase
    .from('memory_associations')
    .select('*')
    .eq('company_id', companyId)
    .eq('relationship_type', 'contradicts');

  if (error || !data) {
    return [];
  }

  return data.map(mapAssociation);
}

/**
 * Update association strength (reinforcement or weakening).
 */
export async function updateAssociationStrength(
  supabase: SupabaseClient,
  associationId: string,
  delta: number
): Promise<boolean> {
  const { data } = await supabase
    .from('memory_associations')
    .select('strength')
    .eq('id', associationId)
    .single();

  if (!data) return false;

  const newStrength = Math.max(0, Math.min(1, (data.strength ?? 0.5) + delta));

  const { error } = await supabase
    .from('memory_associations')
    .update({ strength: newStrength })
    .eq('id', associationId);

  return !error;
}

/**
 * Remove association between two memories.
 */
export async function removeAssociation(
  supabase: SupabaseClient,
  memoryAId: string,
  memoryBId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('memory_associations')
    .delete()
    .or(`and(memory_a_id.eq.${memoryAId},memory_b_id.eq.${memoryBId}),and(memory_a_id.eq.${memoryBId},memory_b_id.eq.${memoryAId})`);

  return !error;
}

/**
 * Get the association graph for a memory (all connected memories).
 */
export async function getAssociationGraph(
  supabase: SupabaseClient,
  memoryId: string,
  depth: number = 2
): Promise<{
  nodes: Set<string>;
  edges: MemoryAssociation[];
}> {
  const nodes = new Set<string>([memoryId]);
  const edges: MemoryAssociation[] = [];
  const visited = new Set<string>([memoryId]);
  const queue: { id: string; level: number }[] = [{ id: memoryId, level: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.level >= depth) continue;

    const associations = await getAssociations(supabase, current.id);

    for (const assoc of associations) {
      edges.push(assoc);

      const otherId = assoc.memoryAId === current.id ? assoc.memoryBId : assoc.memoryAId;
      nodes.add(otherId);

      if (!visited.has(otherId)) {
        visited.add(otherId);
        queue.push({ id: otherId, level: current.level + 1 });
      }
    }
  }

  return { nodes, edges };
}

function mapAssociation(row: Record<string, unknown>): MemoryAssociation {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    memoryAId: row.memory_a_id as string,
    memoryBId: row.memory_b_id as string,
    relationshipType: row.relationship_type as MemoryAssociationType,
    strength: row.strength as number,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | null,
  };
}
