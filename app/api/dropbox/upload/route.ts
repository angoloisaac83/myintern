import { NextResponse } from 'next/server'

function getExtension(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);/)
  const mime = match?.[1] ?? 'application/octet-stream'
  const extension = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin'
  return extension.replace(/[^a-z0-9]/gi, '') || 'bin'
}

function getRawDropboxUrl(url: string) {
  const parsed = new URL(url)
  parsed.searchParams.delete('dl')
  parsed.searchParams.set('raw', '1')
  return parsed.toString()
}

export async function POST(request: Request) {
  const token = process.env.DROPBOX_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Dropbox is not configured on the server.' }, { status: 503 })
  }

  try {
    const body = await request.json() as { dataUrl?: string; filename?: string }
    if (!body.dataUrl?.startsWith('data:')) {
      return NextResponse.json({ error: 'A valid file is required.' }, { status: 400 })
    }

    const base64 = body.dataUrl.split(',')[1]
    if (!base64) return NextResponse.json({ error: 'The file data is empty.' }, { status: 400 })

    const filename = (body.filename || `upload-${Date.now()}.${getExtension(body.dataUrl)}`)
      .replace(/[^a-z0-9._-]/gi, '-')
    const path = `/internship-allocation/${Date.now()}-${filename}`
    const uploadResponse = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true, mute: true }),
      },
      body: Buffer.from(base64, 'base64'),
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text()
      console.error('Dropbox upload failed:', error)
      const message = error.includes('files.content.write') || uploadResponse.status === 401 || uploadResponse.status === 403
        ? 'Dropbox rejected the upload. Enable files.content.write for the Dropbox app, then generate a new access token.'
        : 'Dropbox rejected the upload.'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const metadata = await uploadResponse.json() as { path_display?: string }
    const linkResponse = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: metadata.path_display || path }),
    })

    if (!linkResponse.ok) {
      const error = await linkResponse.text()
      console.error('Dropbox shared link failed:', error)
      const message = error.includes('sharing.write') || linkResponse.status === 401 || linkResponse.status === 403
        ? 'The file uploaded, but Dropbox could not create a link. Enable sharing.write for the Dropbox app, then generate a new access token.'
        : 'The file uploaded, but Dropbox could not create a link.'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const link = await linkResponse.json() as { url?: string }
    return NextResponse.json({ url: link.url ? getRawDropboxUrl(link.url) : undefined })
  } catch (error) {
    console.error('Dropbox upload route failed:', error)
    return NextResponse.json({ error: 'Could not upload the file to Dropbox.' }, { status: 500 })
  }
}
