// Next.js mengganti "server-only" sendiri saat build, jadi paket itu tidak
// terpasang di node_modules. Tes berjalan di luar Next, sehingga butuh
// pengganti kosong ini. Dimuat lewat NODE_PATH=tests/stubs.
module.exports = {}
