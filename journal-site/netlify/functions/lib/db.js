import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// Return CLOB columns (like raw_data) as normal strings instead of stream objects.
oracledb.fetchAsString = [oracledb.CLOB];

let pool;

export async function getConnection() {
  if (!pool) {
    pool = await oracledb.createPool({
      user: process.env.ORACLE_DB_USER,
      password: process.env.ORACLE_DB_PASSWORD,
      connectString: process.env.ORACLE_DB_CONNECT_STRING,
      poolMin: 0,
      poolMax: 5,
      poolIncrement: 1
    });
  }
  return await pool.getConnection();
}

export async function query(sql, binds = [], options = {}) {
  const conn = await getConnection();
  try {
    const result = await conn.execute(sql, binds, options);
    return result.rows;
  } finally {
    await conn.close();
  }
}

export async function execute(sql, binds = [], options = { autoCommit: true }) {
  const conn = await getConnection();
  try {
    const result = await conn.execute(sql, binds, options);
    return result;
  } finally {
    await conn.close();
  }
}