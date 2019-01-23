const tap = require('tap')
const Bytes = require('../src/bytes.js')

tap.test('pop bytes', async assert => {
  const { pop } = Bytes((async function * () {
    yield Buffer.from([1])
    yield Buffer.from([2])
  })())

  assert.is(1, await pop())
  assert.is(2, await pop())
})

tap.test('take after pop', async assert => {
  const { pop, take } = Bytes((async function * () {
    yield Buffer.from([1, 2])
    yield Buffer.from([3])
  })())

  assert.is(1, await pop())
  assert.same([2, 3], await take(2))
})

tap.test('combine two bytes', async assert => {
  const { take } = Bytes((async function * () {
    yield Buffer.from([1])
    yield Buffer.from([2])
  })())

  assert.same([1, 2], await take(2))
})

tap.test('split a buffer', async assert => {
  const { take } = Bytes((async function * () {
    yield Buffer.from([1])
    yield Buffer.from([2, 3])
  })())

  assert.same([1, 2], await take(2))
})

tap.test('take a slice of a buffer', async assert => {
  const { take } = Bytes((async function * () {
    yield Buffer.from([1, 2, 3])
  })())

  assert.same([1, 2], await take(2))
})

tap.test('take an empty slice', async assert => {
  const { take } = Bytes((async function * () {
    yield Buffer.from([1, 2, 3])
  })())

  assert.same([], await take(0))
})

tap.test('take chunks of a buffer', async assert => {
  const { chunks } = Bytes((async function * () {
    yield Buffer.from([1, 2, 3])
    yield Buffer.from([4, 5])
    yield Buffer.from([6, 7])
  })())

  const iterator = chunks(6)

  assert.same([1, 2, 3], (await iterator.next()).value)
  assert.same([4, 5], (await iterator.next()).value)
  assert.same([6], (await iterator.next()).value)
  assert.ok((await iterator.next()).done)
})

tap.test('going past the end of the stream throws', async assert => {
  const { take } = Bytes((async function * () {
    yield Buffer.from([1, 2, 3, 4])
  })())
  assert.rejects(take(5), /end of stream reached/)
})
