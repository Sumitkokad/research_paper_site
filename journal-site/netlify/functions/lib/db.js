// import oracledb from 'oracledb';

// oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// // Return CLOB columns (like raw_data) as normal strings instead of stream objects.
// oracledb.fetchAsString = [oracledb.CLOB];

// let pool;

// export async function getConnection() {
//   if (!pool) {
//     pool = await oracledb.createPool({
//       user: process.env.ORACLE_DB_USER,
//       password: process.env.ORACLE_DB_PASSWORD,
//       connectString: process.env.ORACLE_DB_CONNECT_STRING,
//       poolMin: 0,
//       poolMax: 5,
//       poolIncrement: 1
//     });
//   }
//   return await pool.getConnection();
// }

// export async function query(sql, binds = [], options = {}) {
//   const conn = await getConnection();
//   try {
//     const result = await conn.execute(sql, binds, options);
//     return result.rows;
//   } finally {
//     await conn.close();
//   }
// }

// export async function execute(sql, binds = [], options = { autoCommit: true }) {
//   const conn = await getConnection();
//   try {
//     const result = await conn.execute(sql, binds, options);
//     return result;
//   } finally {
//     await conn.close();
//   }
// }


import oracledb from 'oracledb';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

let poolPromise;

export async function getConnection() {
  // Check required environment variables
  const required = [
    'ORACLE_DB_USER',
    'ORACLE_DB_PASSWORD',
    'ORACLE_DB_CONNECT_STRING'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }

  // Create only one pool per running Node.js instance
  if (!poolPromise) {
    poolPromise = oracledb.createPool({
      user: process.env.ORACLE_DB_USER,
      password: process.env.ORACLE_DB_PASSWORD,
      connectString: process.env.ORACLE_DB_CONNECT_STRING,

      poolMin: 0,
      poolMax: 5,
      poolIncrement: 1,

      poolTimeout: 60,
      poolPingInterval: 60,
      queueTimeout: 30000
    }).catch(error => {
      poolPromise = null;
      throw error;
    });
  }

  const pool = await poolPromise;
  return pool.getConnection();
}

export async function query(sql, binds = [], options = {}) {
  const conn = await getConnection();

  try {
    const result = await conn.execute(sql, binds, {
      // ✅ REQUIRED: enables named binds like :paper_id, :raw_json
      bindByName: true,
      ...options
    });
    return result.rows || [];
  } finally {
    await conn.close();
  }
}

export async function execute(sql, binds = [], options = { autoCommit: true }) {
  const conn = await getConnection();

  try {
    return await conn.execute(sql, binds, {
      // ✅ REQUIRED: enables named binds like :paper_id, :raw_json
      bindByName: true,
      ...options
    });
  } finally {
    await conn.close();
  }
}

export async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close(10);
    poolPromise = null;
  }
}