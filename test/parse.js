const tap = require('tap')
const parse = require('../src/parse.js')

tap.test('parse a small frame', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x81, 0x83, 0x24, 0x5a, 0xa4, 0x90, 0x6b, 0x05, 0xcb])
  })())

  const { value: { data, op } } = await iterator.next()

  assert.is(1, op)
  assert.is('O_o', data)
})

tap.test('text: invalid utf-8', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x81, 0x03, 0xe1, 0xa0, 0xc0])
  })())

  assert.rejects(iterator.next(), /The encoded data was not valid for encoding utf-8/)
})

tap.test('close: invalid utf-8', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x05, 0x03, 0xe9, 0xe1, 0xa0, 0xc0])
  })())

  assert.rejects(iterator.next(), /The encoded data was not valid for encoding utf-8/)
})

tap.test('parse a frame with a 16 bit extended length', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x81, 0x7e, 0x01, 0xf4])
    yield Buffer.from('x'.repeat(500))
  })())

  const { value: { data, op } } = await iterator.next()

  assert.is(1, op)
  assert.is('x'.repeat(500), data)
})

tap.test('parse a frame with a 64 bit extended length', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x81, 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7e])
    yield Buffer.from('x'.repeat(126))
  })())

  const { value: { data, op } } = await iterator.next()

  assert.is(1, op)
  assert.is('x'.repeat(126), await data)
})

tap.test('throw if length is longer than 32 bits', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x81, 0x7f, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])
  })())

  assert.rejects(iterator.next(), /frame too large/)
})

tap.test('parse a binary message', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x82, 0x02])
    yield Buffer.from([0xc3, 0x28])
  })())

  const { value: { data, op } } = await iterator.next()

  assert.is(2, op)
  assert.same([0xc3, 0x28], await data)
})

tap.test('parse an unmasked frame', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x81, 0x03])
    yield Buffer.from('O_o')
  })())

  const { value: { data, op } } = await iterator.next()

  assert.is(1, op)
  assert.is('O_o', await data)
})

tap.test('parse a unmasked frame', async assert => {
  const iterator = parse((async function * () {
    // header
    yield Buffer.from([0x81, 0x85])

    // mask
    yield Buffer.from([0x37, 0xfa, 0x21, 0x3d])

    // first chunk
    yield Buffer.from([0x7f, 0x9f, 0x4d])

    // wait for the next tick
    await new Promise((resolve, reject) => setTimeout(resolve))

    // second chunk received separately to ensure unmasking is correct
    yield Buffer.from([0x51, 0x58])
  })())

  const { value: { data, op } } = await iterator.next()

  assert.is(1, op)
  assert.is('Hello', await data)
})

tap.test('parse fragmented messages', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x01, 0x01])
    yield Buffer.from('O')
    yield Buffer.from([0x00, 0x01])
    yield Buffer.from('_')
    yield Buffer.from([0x80, 0x01])
    yield Buffer.from('o')
  })())

  const { value: { data, op } } = await iterator.next()

  assert.is(1, op)
  assert.is('O_o', await data)
})

tap.test('fragmented messages must be finished before starting another', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x01, 0x01])
    yield Buffer.from('x')
    yield Buffer.from([0x81, 0x01])
    yield Buffer.from('x')
  })())

  assert.rejects(async () => {
    await iterator.next()
    await iterator.next()
  }, /incomplete fragmented message/)
})

tap.test('continuation frames must be preceded by a data frame', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x00, 0x01])
    yield Buffer.from('x')
  })())

  assert.rejects(iterator.next(), /orphaned continuation frame/)
})

tap.test('parse fragmented messages with control frames in between', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x01, 0x01])
    yield Buffer.from('<')
    yield Buffer.from([0x89, 0x00])
    yield Buffer.from([0x80, 0x01])
    yield Buffer.from('>')
  })())

  assert.same({ data: [], op: 9 }, (await iterator.next()).value)
  assert.same({ data: '<>', op: 1 }, (await iterator.next()).value)
})

tap.test('read a masked ping', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x89, 0x85, 0x10, 0x20, 0x30, 0x40, 0x01, 0x02, 0x03, 0x04, 0x05])
  })())

  const { value } = await iterator.next()
  assert.same(value, { data: Buffer.from([0x11, 0x22, 0x33, 0x44, 0x15]), op: 9 })
})

tap.test('two pings', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x89, 0x00])
    yield Buffer.from([0x89, 0x00])
  })())

  const first = (await iterator.next()).value
  assert.same(first, { data: Buffer.from([]), op: 9 })

  const second = (await iterator.next()).value
  assert.same(second, { data: Buffer.from([]), op: 9 })
})

tap.test('read an empty close frame', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x00])
  })())

  const { value: { data, op } } = await iterator.next()

  assert.is(8, op)
  assert.same('', data)
})

tap.test('read a close frame with a code', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x03, 0x03, 0xe9, 0x78])
  })())

  const { value: { code, data, op } } = await iterator.next()

  assert.is(8, op)
  assert.is(1001, code)
  assert.is('x', data)
})

tap.test('close frames with data must be at least two bytes long', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x01, 0x0c])
  })())

  assert.rejects(iterator.next(), /close frame body cannot be 1 byte long/)
})

tap.test('RSV1 must be 0', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0xc0, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved fields must be 0/)
})

tap.test('RSV2 must be 0', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0xa0, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved fields must be 0/)
})

tap.test('RSV3 must be 0', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x90, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved fields must be 0/)
})

tap.test('close frames must have the fin bit set', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x08, 0x00])
  })())

  assert.rejects(iterator.next(), /control frames must not be fragmented/)
})

tap.test('ping frames must have the fin bit set', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x09, 0x00])
  })())

  assert.rejects(iterator.next(), /control frames must not be fragmented/)
})

tap.test('pong frames must have the fin bit set', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x0a, 0x00])
  })())

  assert.rejects(iterator.next(), /control frames must not be fragmented/)
})

tap.test('close frames must be less than 126 bytes long', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x7e, 0x00, 0x7e])
    yield Buffer.from('x'.repeat(126))
  })())

  assert.rejects(iterator.next(), /control frames must be less than 126 bytes long/)
})

tap.test('ping frames must be less than 126 bytes long', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x89, 0x7e, 0x00, 0x7e])
    yield Buffer.from('x'.repeat(126))
  })())

  assert.rejects(iterator.next(), /control frames must be less than 126 bytes long/)
})

tap.test('pong frames must be less than 126 bytes long', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x8a, 0x7e, 0x00, 0x7e])
    yield Buffer.from('x'.repeat(126))
  })())

  assert.rejects(iterator.next(), /control frames must be less than 126 bytes long/)
})

tap.test('reserved op code: 3', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x83, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: 4', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x84, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: 5', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x85, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: 6', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x86, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: 7', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x87, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: b', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x8b, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: c', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x8c, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: d', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x8d, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: e', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x8e, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('reserved op code: f', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x8f, 0x00])
  })())

  assert.rejects(iterator.next(), /reserved op codes are invalid/)
})

tap.test('invalid close code: 0', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x02, 0x00, 0x00])
  })())

  assert.rejects(iterator.next(), /invalid close code: 0/)
})

tap.test('invalid close code: 999', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x02, 0x03, 0xe7])
  })())

  assert.rejects(iterator.next(), /invalid close code: 999/)
})

tap.test('invalid close code: 1004', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x02, 0x03, 0xec])
  })())

  assert.rejects(iterator.next(), /invalid close code: 1004/)
})

tap.test('invalid close code: 1005', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x02, 0x03, 0xed])
  })())

  assert.rejects(iterator.next(), /invalid close code: 1005/)
})

tap.test('invalid close code: 1006', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x02, 0x03, 0xee])
  })())

  assert.rejects(iterator.next(), /invalid close code: 1006/)
})

tap.test('invalid close code: 1016', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x02, 0x03, 0xf8])
  })())

  assert.rejects(iterator.next(), /invalid close code: 1016/)
})

tap.test('invalid close code: 1100', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x02, 0x04, 0x4c])
  })())

  assert.rejects(iterator.next(), /invalid close code: 1100/)
})

tap.test('invalid close code: 2000', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x88, 0x02, 0x07, 0xd0])
  })())

  assert.rejects(iterator.next(), /invalid close code: 2000/)
})

tap.test('limit size in bytes', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x81, 0x05])
    yield Buffer.from('x'.repeat(5))
  })(), { limit: 4 })

  assert.rejects(iterator.next(), /payload too large/)
})

tap.test('fragmented messages are checked for size', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x01, 0x02])
    yield Buffer.from('x'.repeat(2))
    yield Buffer.from([0x80, 0x03])
    yield Buffer.from('x'.repeat(3))
  })(), { limit: 4 })

  assert.rejects(iterator.next(), /payload too large/)
})

tap.test('an incomplete message throws an error', async assert => {
  const iterator = parse((async function * () {
    yield Buffer.from([0x81, 0x01])
  })())

  assert.rejects(iterator.next(), /end of stream reached/)
})
