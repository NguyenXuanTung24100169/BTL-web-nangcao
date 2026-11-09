const test = require('node:test');
const assert = require('node:assert/strict');
const {readDB, seatTaken} = require('../server/store');
const {hash} = require('../server/auth');

test('Co 4 phim demo va cac suat chieu hop le', () => {
 const db=readDB();
 assert.ok(db.movies.length >= 4);
 assert.ok(db.showtimes.every(s => db.movies.some(m=>m.id===s.movieId)));
});
test('Kiem tra ghe trung', () => {
 const db={bookings:[{showtimeId:'s1',seat:'A1'}]};
 assert.equal(seatTaken(db,'s1','A1'),true);
 assert.equal(seatTaken(db,'s1','A2'),false);
 assert.equal(seatTaken(db,'s2','A1'),false);
});
test('Mat khau quan tri demo dung', () => {
 const u=readDB().users.find(x=>x.role==='admin');
 assert.ok(u);
 assert.equal(hash('Admin123!',u.salt),u.passwordHash);
});
