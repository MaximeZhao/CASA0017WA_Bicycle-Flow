
const db = require("./db");

async function testConnection() {
  try {
    const [rows] = await db.query("SHOW TABLES");

    console.log("MySQL connected successfully!");
    console.table(rows);

  } catch (error) {
    console.error("Connection failed:", error.message);

  } finally {
    await db.end();
  }
}

testConnection();
