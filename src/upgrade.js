const http = require('http')
const crypto = require('crypto')
const WebSocket = require('./websocket.js')

module.exports = (request, socket) => {
  const respond = (status, headers) => {
    let response = `HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\n`

    for (const [key, value] of Object.entries(headers)) {
      response += `${key}: ${value}\r\n`
    }

    socket.write(`${response}\r\n`)
  }

  if (request.method !== 'GET') {
    respond(400, { connection: 'close' })
    socket.destroy()
    return
  }

  if (request.headers['sec-websocket-version'] !== '13') {
    respond(400, {
      connection: 'close',
      'sec-websocket-version': '13'
    })
    socket.destroy()
    return
  }

  const accept = crypto.createHash('sha1')
    .update(request.headers['sec-websocket-key'])
    .update('258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')

  respond(101, {
    upgrade: 'websocket',
    connection: 'upgrade',
    'sec-websocket-accept': accept
  })

  return new WebSocket(socket)
}
