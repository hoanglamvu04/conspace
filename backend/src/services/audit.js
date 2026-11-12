export async function writeAudit(client, {
  actorUserId = null, action, entityType, entityId = null,
  before = null, after = null, req = null,
}) {
  await client.query(
    'INSERT INTO conspace.audit_logs ' +
    '(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_ip,user_agent) ' +
    'VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::inet,$8)',
    [
      actorUserId, action, entityType, entityId,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      req?.ip || null, req?.get?.('user-agent')?.slice(0, 512) || null,
    ]
  );
}

export async function writeWorkflowEvent(client, {
  entityType, entityId, fromStatus = null, toStatus, action, reason = null,
  actorUserId = null, metadata = {},
}) {
  await client.query(
    'INSERT INTO conspace.workflow_events ' +
    '(entity_type,entity_id,from_status,to_status,action,reason,actor_user_id,metadata) ' +
    'VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [entityType, entityId, fromStatus, toStatus, action, reason, actorUserId, JSON.stringify(metadata)]
  );
}

export async function inTransaction(db, callback) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
