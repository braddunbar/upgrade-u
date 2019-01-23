const frame = require('./frame.js')
const parse = require('./parse.js')

class WebSocket {
  constructor (socket) {
    this.socket = socket
  }

  close (code, message = '') {
    if (!code) {
      this.frame('', 8)
      return
    }
    const buffer = Buffer.alloc(2 + Buffer.byteLength(message))
    buffer.writeUInt16BE(code)
    buffer.write(message, 2)
    this.frame(buffer, 8)
    this.socket.end()
  }

  ping (data) {
    this.frame(data, 9)
  }

  pong (data) {
    this.frame(data, 10)
  }

  send (data) {
    this.frame(data, typeof data === 'string' ? 1 : 2)
  }

  frame (data, op) {
    this.socket.write(frame(data, op))
    this.socket.write(data)
  }

  async * [Symbol.asyncIterator] () {
    try {
      const iterator = this.socket[Symbol.asyncIterator]()

      for await (const { code, data, op } of parse(iterator)) {
        switch (op) {
          case 1:
            yield { type: 'text', data }
            break

          case 2:
            yield { type: 'binary', data }
            break

          case 8:
            this.close(1000)
            yield { type: 'close', code, data }
            return

          case 9:
            this.pong(data)
            yield { type: 'ping', data }
            break

          case 10:
            yield { type: 'pong', data }
            break
        }
      }
    } catch (error) {
      switch (error.code) {
        case 'ERR_ENCODING_INVALID_ENCODED_DATA':
          this.close(1007, error.message)
          break

        default:
          this.close(1002, error.message)
          break
      }
    }
  }
}

module.exports = WebSocket
