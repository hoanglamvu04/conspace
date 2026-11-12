import { Router } from 'express';
import { pool } from '../../database/pool.js';
import { env } from '../../config/env.js';
import { RequestError } from '../../http/validation.js';
import { requireAuth, requireCsrf } from '../../middleware/admin-auth.js';
import { createAuthService } from '../../services/auth.js';
import { createAdminAuthRouter } from './auth.js';
import { createUsersRouter } from './users.js';
import { createAuthorsRouter } from './authors.js';
import { createArticlesRouter } from './articles.js';
import { createNichesRouter } from './niches.js';
import { createBooksRouter, createChaptersRouter } from './books.js';
import { createFieldNotesRouter } from './field-notes.js';
import { createTermsRouter } from './terms.js';
import { createQuestionsRouter } from './questions.js';
import { createMediaRouter } from './media.js';
import { createReviewsRouter } from './reviews.js';
import { createEditorialService } from '../../services/editorial.js';

export function createAdminRouter(db=pool,config=env){
  const router=Router();
  if(!db){
    router.use((_req,_res,next)=>next(new RequestError(503,'DATABASE_UNAVAILABLE','CMS database is unavailable')));
    return router;
  }
  const authService=createAuthService(db,config);
  const editorial=createEditorialService(db);

  router.use('/auth',createAdminAuthRouter({authService,db,config}));
  router.use(requireAuth(authService));
  router.use(requireCsrf);

  router.get('/',(req,res)=>{
    res.json({ok:true,data:{user:req.auth,modules:[
      'users','authors','articles','niches','books','chapters','field-notes','terms','questions','media','reviews',
    ]}});
  });

  router.use('/users',createUsersRouter(db));
  router.use('/authors',createAuthorsRouter(db));
  router.use('/articles',createArticlesRouter(db,editorial));
  router.use('/niches',createNichesRouter(db));
  router.use('/books',createBooksRouter(db));
  router.use('/chapters',createChaptersRouter(db));
  router.use('/field-notes',createFieldNotesRouter(db,editorial));
  router.use('/terms',createTermsRouter(db));
  router.use('/questions',createQuestionsRouter(db,config));
  router.use('/media',createMediaRouter(db));
  router.use('/reviews',createReviewsRouter(db,editorial));

  router.use((_req,_res,next)=>{
    next(new RequestError(404,'NOT_FOUND','Admin endpoint not found'));
  });
  return router;
}
