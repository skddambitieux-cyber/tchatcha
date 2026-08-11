import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createTestApp } from '../test-app';
import { User, UserStatus } from '../../src/modules/auth/domain/entities/user.entity';

describe('Lot 6.3.5b-2 — administration des vérifications A1–A8', () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let db: DataSource;
  let adminToken: string;
  let proToken: string;
  let profileId: string;
  let nationalId: string;
  let selfieId: string;
  let diplomaId: string;

  beforeAll(async () => {
    app = await createTestApp(); db = app.app.get(DataSource); await cleanup();
    const adminId = await seedUser('66040301', 'ADMIN');
    const proId = await seedUser('66040302', 'PROFESSIONAL');
    await seedUser('66040303', 'CLIENT');
    profileId = randomUUID();
    await db.query(`INSERT INTO pros.profiles (id,user_id,business_name,status,verified,currency,country_code,version,created_at,updated_at)
      VALUES ($1,$2,'Pro Admin E2E','ACTIVE',false,'XOF','BJ',1,now(),now())`, [profileId, proId]);
    adminToken = await login('66040301', 'a-admin'); proToken = await login('66040302', 'a-pro');
    expect(adminId).toBeTruthy();
  });
  afterAll(async () => { if (db) await cleanup(); await app?.close(); });

  async function cleanup() {
    await db.query(`DELETE FROM admin.validation_tasks WHERE entity_type='PRO_VERIFICATION' AND entity_id IN
      (SELECT v.id FROM pros.verifications v JOIN pros.profiles p ON p.id=v.professional_id JOIN users.users u ON u.id=p.user_id WHERE u.phone LIKE '660403%')`);
    await db.query(`DELETE FROM pros.verifications WHERE professional_id IN (SELECT p.id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone LIKE '660403%')`);
    await db.query(`DELETE FROM media.files WHERE owner_id IN (SELECT p.id FROM pros.profiles p JOIN users.users u ON u.id=p.user_id WHERE u.phone LIKE '660403%')`);
    await db.query(`DELETE FROM pros.profiles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE '660403%')`);
    await db.query(`DELETE FROM users.user_roles WHERE user_id IN (SELECT id FROM users.users WHERE phone LIKE '660403%')`);
    await db.query(`DELETE FROM users.users WHERE phone LIKE '660403%'`);
  }
  async function seedUser(phone: string, role: string) {
    const user = await db.getRepository(User).save(db.getRepository(User).create({ country_code:'BJ', phone, password_hash:'', full_name:phone, status:UserStatus.ACTIVE, flags:{} }));
    await db.query(`INSERT INTO users.user_roles(user_id,role,granted_at) VALUES($1,$2,now())`, [user.id, role]); return user.id;
  }
  async function login(phone: string, session: string) {
    await app.http.post('/api/v1/auth/otp/request').send({ country_code:'BJ', phone, purpose:'LOGIN' }).expect(202);
    const code = app.sms.lastCode('BJ', phone);
    const res = await app.http.post('/api/v1/auth/login').send({ country_code:'BJ', phone, code, device:{ session_id:session } }).expect(200);
    return res.body.access_token as string;
  }
  async function submit(type: string) {
    const media = await app.http.post('/api/v1/media/presign').set('Authorization',`Bearer ${proToken}`)
      .send({ purpose:'DOCUMENT', mime_type:'image/jpeg', size_bytes:1024 }).expect(201);
    const res = await app.http.post('/api/v1/professionals/me/verifications').set('Authorization',`Bearer ${proToken}`)
      .send({ items:[{ type, media_id:media.body.media_id }] }).expect(201);
    return res.body.verifications[0].id as string;
  }
  const auth = (token: string) => ({ Authorization:`Bearer ${token}` });

  it('A1 — refuse un utilisateur non ADMIN', async () => {
    const token = await login('66040303','a-client');
    await app.http.get('/api/v1/admin/verifications').set(auth(token)).expect(403).expect(({body}) => expect(body.code).toBe('forbidden'));
  });
  it('A2 — retourne une file vide', async () => {
    await app.http.get('/api/v1/admin/verifications').set(auth(adminToken)).expect(200)
      .expect(({body}) => expect(body).toMatchObject({ items:[], total:0, page:1, limit:50 }));
  });
  it('A3 — retourne la file paginée avec URLs privées signées', async () => {
    nationalId=await submit('NATIONAL_ID'); selfieId=await submit('SELFIE'); diplomaId=await submit('DIPLOMA');
    await app.http.get('/api/v1/admin/verifications?page=1&limit=2').set(auth(adminToken)).expect(200)
      .expect(({body}) => { expect(body.total).toBe(3); expect(body.items).toHaveLength(2); expect(body.items[0].documents[0].url).toContain('/read/'); });
  });
  it('A4 — approuve CIN + selfie et pose le badge niveau 2', async () => {
    await app.http.put(`/api/v1/admin/verifications/${nationalId}/decide`).set(auth(adminToken)).send({approve:true}).expect(200);
    await app.http.put(`/api/v1/admin/verifications/${selfieId}/decide`).set(auth(adminToken)).send({approve:true}).expect(200)
      .expect(({body}) => expect(body.verification_level).toBe(2));
    const [profile] = await db.query(`SELECT verified,verified_at FROM pros.profiles WHERE id=$1`,[profileId]);
    const [reputation] = await db.query(`SELECT verification_level FROM pros.reputation WHERE professional_id=$1`,[profileId]);
    expect(profile.verified).toBe(true); expect(profile.verified_at).toBeTruthy(); expect(reputation.verification_level).toBe(2);
  });
  it('A5 — exige un motif au rejet', async () => {
    await app.http.put(`/api/v1/admin/verifications/${diplomaId}/decide`).set(auth(adminToken)).send({approve:false}).expect(422)
      .expect(({body}) => expect(body.code).toBe('missing_reason'));
  });
  it('A6 — rejette avec motif et complète la tâche', async () => {
    await app.http.put(`/api/v1/admin/verifications/${diplomaId}/decide`).set(auth(adminToken)).send({approve:false,reason:'illisible'}).expect(200);
    const [task] = await db.query(`SELECT status,note FROM admin.validation_tasks WHERE entity_id=$1`,[diplomaId]);
    expect(task).toMatchObject({status:'COMPLETED',note:'illisible'});
  });
  it('A7 — révoque un APPROVED et retire le badge', async () => {
    await app.http.put(`/api/v1/admin/verifications/${selfieId}/decide`).set(auth(adminToken)).send({approve:false,reason:'fraude'}).expect(200)
      .expect(({body}) => expect(body.verification_level).toBe(1));
    const [profile] = await db.query(`SELECT verified,verified_at FROM pros.profiles WHERE id=$1`,[profileId]);
    expect(profile.verified).toBe(false); expect(profile.verified_at).toBeNull();
  });
  it('A8 — refuse une nouvelle décision sur REJECTED', async () => {
    await app.http.put(`/api/v1/admin/verifications/${selfieId}/decide`).set(auth(adminToken)).send({approve:true}).expect(409)
      .expect(({body}) => expect(body.code).toBe('verification_pending'));
  });
});
