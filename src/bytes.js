const bl = require('bl')

module.exports = (iterator) => {
  const list = bl()

  // Read `length` bytes from the stream
  const read = (length) => {
    const buffer = list.slice(0, length)
    list.consume(length)
    return buffer
  }

  // Wait for the next chunk of data
  const next = async () => {
    const { done, value } = await iterator.next()
    if (done) throw new Error('end of stream reached')
    list.append(value)
  }

  // Pop one byte from the stream
  const pop = async () => (await take(1))[0]

  // Take `length` bytes from the stream in a buffer
  const take = async (length) => {
    while (list.length < length) await next()
    return read(length)
  }

  // Yield `length` bytes in a series of chunks
  const chunks = async function * (length) {
    while (length) {
      if (!list.length) await next()
      const chunk = read(Math.min(length, list.length))
      length -= chunk.length
      yield chunk
    }
  }

  return { chunks, pop, take }
}
