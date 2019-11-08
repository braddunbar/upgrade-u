const BufferList = require('bl')
const Bytes = require('./bytes.js')
const unmask = require('./unmask.js')
const { TextDecoder } = require('util')

class TextMessage {
  constructor () {
    this.value = ''
    this.decoder = new TextDecoder('utf-8', { fatal: true })
  }

  end () {
    return this.value + this.decoder.decode()
  }

  get length () {
    return this.value.length
  }

  push (buffer) {
    this.value += this.decoder.decode(buffer, { stream: true })
  }
}

class BinaryMessage {
  constructor () {
    this.list = new BufferList()
  }

  end () {
    return this.list.slice()
  }

  get length () {
    return this.list.length
  }

  push (buffer) {
    this.list.append(buffer)
  }
}

module.exports = async function * (iterator, options = {}) {
  const bytes = Bytes(iterator)
  const { limit = Infinity } = options

  while (true) {
    const { control, fin, length, mask, op } = await header(bytes)

    if (control) {
      yield await controlFrame(bytes, { length, mask, op })
      continue
    }

    if (op === 0) throw new Error('orphaned continuation frame')

    const message = op === 1 ? new TextMessage() : new BinaryMessage()

    const payload = async (length, mask) => {
      if (message.length + length > limit) throw new Error('payload too large')

      let iterator = bytes.chunks(length)

      if (mask) iterator = unmask(iterator, mask)

      for await (const chunk of iterator) {
        message.push(chunk)
      }
    }

    await payload(length, mask)

    if (!fin) {
      while (true) {
        const { control, fin, length, mask, op } = await header(bytes)

        if (control) {
          yield await controlFrame(bytes, { length, mask, op })
          continue
        }

        if (op !== 0) throw new Error('incomplete fragmented message')

        await payload(length, mask)

        if (fin) break
      }
    }

    yield { op, data: message.end() }
  }
}

// Valid op codes
const OPS = new Set([0x0, 0x1, 0x2, 0x8, 0x9, 0xa])

// Parse the frame header
async function header (bytes) {
  const first = await bytes.pop()

  const op = first & 0x0f
  const fin = (first & 0x80) === 0x80
  const control = (first & 0x08) === 0x08

  if (!OPS.has(op)) {
    throw new Error('reserved op codes are invalid')
  }

  if ((first & 0x70) !== 0x00) {
    throw new Error('reserved fields must be 0')
  }

  if (control && !fin) {
    throw new Error('control frames must not be fragmented')
  }

  const second = await bytes.pop()

  let length = second & 0x7f

  if (length === 126) {
    length = (await bytes.take(2)).readUInt16BE(0)
  } else if (length === 127) {
    const value = (await bytes.take(8)).readBigUInt64BE()

    if (value > global.BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('frame too large')
    }

    length = Number(value)
  }

  const mask = (second & 0x80) === 0x80 ? await bytes.take(4) : null

  return { control, fin, length, mask, op }
}

// Parse a control frame
async function controlFrame (bytes, { length, mask, op }) {
  if (length > 125) {
    throw new Error('control frames must be less than 126 bytes long')
  }

  const data = await bytes.take(length)

  if (mask) {
    for (const index of data.keys()) {
      data[index] ^= mask[index % 4]
    }
  }

  if (op !== 8) return { data, op }

  if (data.length === 1) {
    throw new Error('close frame body cannot be 1 byte long')
  }

  const code = data.length >= 2 ? data.readUInt16BE(0) : null

  const invalid = code != null && (
    (code < 1000) ||
    (code > 1003 && code < 1007) ||
    (code > 1015 && code < 3000)
  )

  if (invalid) {
    throw new Error(`invalid close code: ${code}`)
  }

  const decoder = new TextDecoder('utf-8', { fatal: true })

  return { code, data: decoder.decode(data.slice(2)), op }
}
