const http = require('http')
const tap = require('tap')
const upgrade = require('../src/upgrade.js')

const connect = async ({ headers, method }, test) => {
  const server = http.createServer(() => {})

  server.on('upgrade', (request, socket) => {
    upgrade(request, socket)
  })

  await new Promise((resolve, reject) => {
    server.listen(resolve)
    server.on('error', reject)
  })

  const { port, family } = server.address()

  const [response, socket] = await new Promise((resolve, reject) => {
    const request = http.request({
      method: method || 'GET',
      port,
      family: family === 'IPv6' ? 6 : 4,
      headers
    }, (response) => resolve([response]))
    request.on('upgrade', (response, socket) => { resolve([response, socket]) })
    request.on('error', reject)
    request.end()
  })

  try {
    await test(response)
  } finally {
    if (socket) socket.destroy()
    server.close()
  }
}

tap.test('sec-websocket-accept header', async assert => {
  await connect({
    headers: {
      upgrade: 'websocket',
      connection: 'upgrade',
      'sec-websocket-key': '9IwpQ4Hi2+odJVbUyFiO6Q==',
      'sec-websocket-version': '13'
    }
  },
  async (response) => {
    assert.is(response.statusCode, 101)
    assert.is(response.headers.upgrade, 'websocket')
    assert.is(response.headers.connection, 'upgrade')
    assert.is(response.headers['sec-websocket-accept'], '1/EzsDDt6P7ixFGfaealxqPsxh4=')
  })
})

tap.test('require sec-websocket-version 13', async assert => {
  await connect({
    headers: {
      upgrade: 'websocket',
      connection: 'upgrade',
      'sec-websocket-key': '9IwpQ4Hi2+odJVbUyFiO6Q==',
      'sec-websocket-version': '24'
    }
  },
  async (response) => {
    assert.is(response.statusCode, 400)
    assert.is(response.headers.connection, 'close')
    assert.is(response.headers['sec-websocket-accept'], undefined)
  })
})

tap.test('reject POST requests', async assert => {
  await connect({
    method: 'POST',
    headers: {
      upgrade: 'websocket',
      connection: 'upgrade',
      'sec-websocket-key': '9IwpQ4Hi2+odJVbUyFiO6Q==',
      'sec-websocket-version': '13'
    }
  },
  async (response) => {
    assert.is(response.statusCode, 400)
    assert.is(response.headers.connection, 'close')
    assert.is(response.headers['sec-websocket-accept'], undefined)
  })
})
