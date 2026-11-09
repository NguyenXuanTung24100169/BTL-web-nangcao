// THANH VIEN 3: Du lieu phim, suat chieu, ve dat
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'database.json');
function readDB() { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeDB(data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
function seatTaken(db, showtimeId, seat) { return db.bookings.some(b => b.showtimeId === showtimeId && b.seat === seat); }
module.exports = {readDB, writeDB, seatTaken};
