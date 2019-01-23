const http = require('http')
const PORT = process.env.PORT || 3333
const upgrade = require('../src/upgrade.js')

const server = http.createServer(() => { }).listen(PORT)

server.on('upgrade', async (request, socket) => {
  const websocket = upgrade(request, socket)

  for await (const { type, data } of websocket) {
    if (type === 'text' || type === 'binary') {
      websocket.send(data)
    }
  }
})
