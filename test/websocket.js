const tap = require('tap')
const http = require('http')
const WebSocket = require('../src/websocket.js')
const upgrade = require('../src/upgrade.js')

async function connect (test) {
  const server = http.createServer(() => {})

  server.on('upgrade', async (request, socket) => {
    const websocket = upgrade(request, socket)
    for await (const { data, type } of websocket[Symbol.asyncIterator]()) {
      if (type === 'text' || type === 'binary') {
        websocket.send(data)
      }
    }
  })

  await new Promise((resolve, reject) => {
    server.listen(resolve)
    server.on('error', reject)
  })

  const { port, family } = server.address()
  const request = http.request({
    port,
    family: family === 'IPv6' ? 6 : 4,
    headers: {
      connection: 'upgrade',
      'sec-websocket-key': 'test key',
      'sec-websocket-version': '13',
      upgrade: 'websocket'
    }
  })

  const socket = await new Promise((resolve, reject) => {
    request.on('upgrade', (response, socket) => { resolve(socket) })
    request.end()
  })

  try {
    await test(new WebSocket(socket))
  } finally {
    socket.destroy()
    server.close()
  }
}

tap.test('ping/pong', async assert => {
  await connect(async websocket => {
    websocket.ping('*')

    const { value: { data, type } } = await websocket[Symbol.asyncIterator]().next()

    assert.is(type, 'pong')
    assert.same(data, Buffer.from('*'))
  })
})

tap.test('close the connection', async assert => {
  await connect(async websocket => {
    websocket.close()

    const { value: { code, data, type } } = await websocket[Symbol.asyncIterator]().next()

    assert.is(code, 1000)
    assert.is(type, 'close')
    assert.same(data, '')
  })
})

tap.test('write a text frame', async assert => {
  await connect(async websocket => {
    websocket.send('test')

    const { value: { data, type } } = await websocket[Symbol.asyncIterator]().next()

    assert.is(type, 'text')
    assert.is(data, 'test')
  })
})

tap.test('write a long text frame', async assert => {
  await connect(async websocket => {
    websocket.send('*'.repeat(0x10000))

    const { value: { data, type } } = await websocket[Symbol.asyncIterator]().next()

    assert.is(type, 'text')
    assert.is(data, '*'.repeat(0x10000))
  })
})

tap.test('write a binary frame', async assert => {
  await connect(async websocket => {
    websocket.send(Buffer.from([0x01, 0x02]))

    const { value: { data, type } } = await websocket[Symbol.asyncIterator]().next()

    assert.is(type, 'binary')
    assert.same(data, Buffer.from([0x01, 0x02]))
  })
})

tap.test('close connection on error', async assert => {
  await connect(async websocket => {
    websocket.socket.write(Buffer.from([0x80, 0x01, 0x01]))

    const { value: { code, data, type } } = await websocket[Symbol.asyncIterator]().next()

    assert.is(type, 'close')
    assert.is(code, 1002)
    assert.same(data, 'orphaned continuation frame')
  })
})

tap.test('invalid utf-8', async assert => {
  await connect(async websocket => {
    websocket.socket.write(Buffer.from([0x81, 0x03, 0xe1, 0xa0, 0xc0]))

    const { value: { code, data, type } } = await websocket[Symbol.asyncIterator]().next()

    assert.is(type, 'close')
    assert.is(code, 1007)
    assert.same(data, 'The encoded data was not valid for encoding utf-8')
  })
})

tap.test('several messages', async assert => {
  await connect(async websocket => {
    websocket.send('x')
    websocket.send(Buffer.from([0x78]))
    websocket.ping('')
    websocket.close()

    const messages = websocket[Symbol.asyncIterator]()

    assert.same({ type: 'text', data: 'x' }, (await messages.next()).value)
    assert.same({ type: 'binary', data: Buffer.from([0x78]) }, (await messages.next()).value)
    assert.same({ type: 'pong', data: Buffer.from('') }, (await messages.next()).value)
    assert.same({ type: 'close', code: 1000, data: '' }, (await messages.next()).value)
    assert.ok((await messages.next()).done)
  })
})

tap.test('an incomplete message closes the connection', async assert => {
  await connect(async websocket => {
    websocket.socket.end(Buffer.from([0x81, 0x01]))

    const { value: { code, data, type } } = await websocket[Symbol.asyncIterator]().next()

    assert.is(type, 'close')
    assert.is(code, 1002)
    assert.same(data, 'end of stream reached')
  })
})
