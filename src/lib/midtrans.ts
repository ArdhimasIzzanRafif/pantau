import midtransClient from "midtrans-client"

export function createSnap(serverKey: string, clientKey: string, isProduction: boolean) {
  return new midtransClient.Snap({ isProduction, serverKey, clientKey })
}

export function snapJsUrl(isProduction: boolean) {
  return isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js"
}

export type MidtransConfig = {
  serverKey: string
  clientKey: string
  isProduction: boolean
}
