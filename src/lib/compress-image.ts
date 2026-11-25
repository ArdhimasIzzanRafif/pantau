// Foto dari kamera HP bermasalah saat diunggah: iPhone menyimpan HEIC (ditolak
// server) dan ukurannya kerap 3–5 MB (melebihi batas 2 MB). Di sini foto
// digambar ulang ke canvas lalu diekspor sebagai JPEG, sehingga formatnya pasti
// diterima dan ukurannya jauh lebih kecil. Kualitas untuk foto bukti lebih dari
// cukup pada 1600px.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8

export async function compressImage(file: File): Promise<File> {
  // File non-gambar atau GIF (animasi) dibiarkan apa adanya.
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Gambar tidak bisa dibaca"))
      img.src = objectUrl
    })

    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height))
    const width = Math.round(image.width * scale)
    const height = Math.round(image.height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    )
    if (!blob) return file

    const name = file.name.replace(/\.[^.]+$/, "") || "foto"
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" })
  } catch {
    // Gagal mengonversi (mis. format tak terbaca) — biarkan file asli, server
    // yang akan menolak dengan pesan yang jelas.
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
