require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./app/routes');
const { csrf } = require('./app/middlewares/auth');
require('./app/models/db');

const app = express();
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'app/views'));
app.use(helmet({ contentSecurityPolicy:false }));
app.use(express.urlencoded({extended:false}));
app.use(express.static(path.join(__dirname,'public')));
app.use(session({
  store: new SQLiteStore({ db:'sessions.db', dir:path.join(__dirname,'data') }),
  secret:process.env.SESSION_SECRET || 'development-secret-change-me',
  resave:false,
  saveUninitialized:false,
  cookie:{ httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV==='production', maxAge:1000*60*60*8 }
}));
app.use((req,res,next) => {
  res.locals.user=req.session.userId ? { id:req.session.userId, name:req.session.userName, role:req.session.role } : null;
  res.locals.flash=req.session.flash || null;
  delete req.session.flash;
  next();
});
app.use(csrf);
app.use('/login',rateLimit({windowMs:10*60*1000,max:30,standardHeaders:true,legacyHeaders:false}));
app.use(routes);

app.use((err,req,res,next) => {
  console.error(err.message);
  res.status(500).render('errors/500',{title:'Erro interno',error:process.env.NODE_ENV==='development'?err.message:null});
});

const port=process.env.PORT || 3000;
if(require.main===module) app.listen(port,()=>console.log(`ReConecta Alimentos em http://localhost:${port}`));
module.exports=app;
