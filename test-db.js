const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findMany()
  .then(u => { console.log('USERS:', u.map(x => x.email)); return p.$disconnect(); })
  .catch(e => { console.error('DB ERROR:', e.message); return p.$disconnect(); });
