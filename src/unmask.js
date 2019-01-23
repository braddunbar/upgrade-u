module.exports = async function * (iterator, mask) {
  let index = 0
  for await (const chunk of iterator) {
    for (const key of chunk.keys()) {
      chunk[key] ^= mask[index++ % 4]
    }
    yield chunk
  }
}
