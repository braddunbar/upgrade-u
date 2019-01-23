const tap = require('tap')
const unmask = require('../src/unmask.js')

tap.test('unmask chunks', async assert => {
  async function * chunks () {
    yield Buffer.from([0x01, 0x02, 0x03, 0x04])
    yield Buffer.from([0x05, 0x06, 0x07, 0x08])
  }

  const mask = Buffer.from([0x10, 0x20, 0x30, 0x40])

  const iterator = unmask(chunks(), mask)

  assert.same([0x11, 0x22, 0x33, 0x44], (await iterator.next()).value)
  assert.same([0x15, 0x26, 0x37, 0x48], (await iterator.next()).value)
  assert.ok((await iterator.next()).done)
})
