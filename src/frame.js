module.exports = (data, op = 1) => {
  let size = 2
  const length = Buffer.byteLength(data)

  if (length > 0xffff) {
    size += 8
  } else if (length > 0x7d) {
    size += 2
  }

  const buffer = Buffer.alloc(size)

  buffer[0] = 0x80 | (0x0f & op)

  if (length > 0xffff) {
    buffer[1] = 0x7f
    buffer.writeUInt32BE(length, 6)
  } else if (length > 0x7d) {
    buffer[1] = 0x7e
    buffer.writeUInt16BE(length, 2)
  } else {
    buffer[1] = length
  }

  return buffer
}
