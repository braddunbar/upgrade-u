const tap = require('tap')
const frame = require('../src/frame.js')

tap.test('binary op', async assert => {
  const buffer = frame('x'.repeat(4), 2)
  assert.same(buffer, Buffer.from([0x82, 0x04]))
})

tap.test('7 bit length', async assert => {
  const buffer = frame('x'.repeat(4))
  assert.same(buffer, Buffer.from([0x81, 0x04]))
})

tap.test('16 bit length', async assert => {
  const buffer = frame('x'.repeat(500))
  assert.same(buffer, Buffer.from([0x81, 0x7e, 0x01, 0xf4]))
})

tap.test('max 16 bit length', async assert => {
  const buffer = frame('x'.repeat(0xffff))
  assert.same(buffer, Buffer.from([0x81, 0x7e, 0xff, 0xff]))
})

tap.test('64 bit length', async assert => {
  const buffer = frame('x'.repeat(0x10000))
  assert.same(buffer, Buffer.from([0x81, 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]))
})
