// Vercel serverless entrypoint. Imports the configured Express app from
// server.js (which skips app.listen() when not run directly) and exports it
// as the function handler. All routes are rewritten here via vercel.json.
module.exports = require('../server.js');
