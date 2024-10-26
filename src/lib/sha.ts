// SHA-256 (+ HMAC and PBKDF2) for JavaScript.
//
// Written in 2014-2016 by Dmitry Chestnykh.
// Public domain, no warranty.
//
// Functions (accept and return Uint8Arrays):
//
//   sha256(message) -> hash
//   sha256.hmac(key, message) -> mac
//   sha256.pbkdf2(password, salt, rounds, dkLen) -> dk
//
//  Classes:
//
//   new sha256.Hash()
//   new sha256.HMAC(key)
//
export const digestLength = 32;
export const blockSize = 64;

// SHA-256 constants
const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function HashBlocks(w: Int32Array, v: Int32Array, p: Uint8Array, pos: number, len: number): number {
    let a = 0;
    let b = 0;
    let c = 0;
    let d = 0;
    let e = 0;
    let f = 0;
    let g = 0;
    let h = 0;
    let u = 0;
    let i = 0;
    let j = 0;
    let t1 = 0;
    let t2 = 0;
    while (len >= 64) {
        a = v[0]!;
        b = v[1]!;
        c = v[2]!;
        d = v[3]!;
        e = v[4]!;
        f = v[5]!;
        g = v[6]!;
        h = v[7]!;

        for (i = 0; i < 16; i++) {
            j = pos + i * 4;
            w[i] =
                ((p[j]! & 0xff) << 24) |
                ((p[j + 1]! & 0xff) << 16) |
                ((p[j + 2]! & 0xff) << 8) |
                (p[j + 3]! & 0xff);
        }

        for (i = 16; i < 64; i++) {
            u = w[i - 2]!;
            t1 = ((u >>> 17) | (u << (32 - 17))) ^ ((u >>> 19) | (u << (32 - 19))) ^ (u >>> 10);

            u = w[i - 15]!;
            t2 = ((u >>> 7) | (u << (32 - 7))) ^ ((u >>> 18) | (u << (32 - 18))) ^ (u >>> 3);

            w[i] = ((t1 + w[i - 7]!) | 0) + ((t2 + w[i - 16]!) | 0);
        }

        for (i = 0; i < 64; i++) {
            t1 =
                ((((((e >>> 6) | (e << (32 - 6))) ^
                    ((e >>> 11) | (e << (32 - 11))) ^
                    ((e >>> 25) | (e << (32 - 25)))) +
                    ((e & f) ^ (~e & g))) |
                    0) +
                    ((h + ((K[i]! + w[i]!) | 0)) | 0)) |
                0;

            t2 =
                ((((a >>> 2) | (a << (32 - 2))) ^
                    ((a >>> 13) | (a << (32 - 13))) ^
                    ((a >>> 22) | (a << (32 - 22)))) +
                    ((a & b) ^ (a & c) ^ (b & c))) |
                0;

            h = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }

        v[0]! += a;
        v[1]! += b;
        v[2]! += c;
        v[3]! += d;
        v[4]! += e;
        v[5]! += f;
        v[6]! += g;
        v[7]! += h;

        pos += 64;
        len -= 64;
    }
    return pos;
}

// Hash implements SHA256 hash algorithm.
export class Hash {
    public finished = false; // indicates whether the hash was finalized
    digestLength: number = digestLength;
    blockSize: number = blockSize;

    // Note: Int32Array is used instead of Uint32Array for performance reasons.
    private _state: Int32Array = new Int32Array(8); // hash state
    private _temp: Int32Array = new Int32Array(64); // temporary state
    private _buffer: Uint8Array = new Uint8Array(128); // buffer for data to hash
    private _bufferLength = 0; // number of bytes in buffer
    private _bytesHashed = 0; // number of total bytes hashed

    constructor() {
        this.reset();
    }

    // Resets hash state making it possible
    // to re-use this instance to hash other data.
    public reset(): this {
        this._state[0] = 0x6a09e667;
        this._state[1] = 0xbb67ae85;
        this._state[2] = 0x3c6ef372;
        this._state[3] = 0xa54ff53a;
        this._state[4] = 0x510e527f;
        this._state[5] = 0x9b05688c;
        this._state[6] = 0x1f83d9ab;
        this._state[7] = 0x5be0cd19;
        this._bufferLength = 0;
        this._bytesHashed = 0;
        this.finished = false;
        return this;
    }

    // Cleans internal buffers and re-initializes hash state.
    public clean() {
        for (let i = 0; i < this._buffer.length; i++) {
            this._buffer[i] = 0;
        }
        for (let i = 0; i < this._temp.length; i++) {
            this._temp[i] = 0;
        }
        this.reset();
    }

    // Updates hash state with the given data.
    //
    // Optionally, length of the data can be specified to hash
    // fewer bytes than data.length.
    //
    // Throws error when trying to update already finalized hash:
    // instance must be reset to use it again.
    public update(data: Uint8Array, dataLength: number = data.length): this {
        if (this.finished) {
            throw new Error("SHA256: can't update because hash was finished.");
        }
        let dataPos = 0;
        this._bytesHashed += dataLength;
        if (this._bufferLength > 0) {
            while (this._bufferLength < 64 && dataLength > 0) {
                this._buffer[this._bufferLength++] = data[dataPos++]!;
                dataLength--;
            }
            if (this._bufferLength === 64) {
                HashBlocks(this._temp, this._state, this._buffer, 0, 64);
                this._bufferLength = 0;
            }
        }
        if (dataLength >= 64) {
            dataPos = HashBlocks(this._temp, this._state, data, dataPos, dataLength);
            dataLength %= 64;
        }
        while (dataLength > 0) {
            this._buffer[this._bufferLength++] = data[dataPos++]!;
            dataLength--;
        }
        return this;
    }

    // Finalizes hash state and puts hash into out.
    //
    // If hash was already finalized, puts the same value.
    public finish(out: Uint8Array): this {
        if (!this.finished) {
            const bytesHashed = this._bytesHashed;
            const left = this._bufferLength;
            const bitLenHi = (bytesHashed / 0x20000000) | 0;
            const bitLenLo = bytesHashed << 3;
            const padLength = bytesHashed % 64 < 56 ? 64 : 128;

            this._buffer[left] = 0x80;
            for (let i = left + 1; i < padLength - 8; i++) {
                this._buffer[i] = 0;
            }
            this._buffer[padLength - 8] = (bitLenHi >>> 24) & 0xff;
            this._buffer[padLength - 7] = (bitLenHi >>> 16) & 0xff;
            this._buffer[padLength - 6] = (bitLenHi >>> 8) & 0xff;
            this._buffer[padLength - 5] = (bitLenHi >>> 0) & 0xff;
            this._buffer[padLength - 4] = (bitLenLo >>> 24) & 0xff;
            this._buffer[padLength - 3] = (bitLenLo >>> 16) & 0xff;
            this._buffer[padLength - 2] = (bitLenLo >>> 8) & 0xff;
            this._buffer[padLength - 1] = (bitLenLo >>> 0) & 0xff;

            HashBlocks(this._temp, this._state, this._buffer, 0, padLength);

            this.finished = true;
        }

        for (let i = 0; i < 8; i++) {
            out[i * 4 + 0] = (this._state[i]! >>> 24) & 0xff;
            out[i * 4 + 1] = (this._state[i]! >>> 16) & 0xff;
            out[i * 4 + 2] = (this._state[i]! >>> 8) & 0xff;
            out[i * 4 + 3] = (this._state[i]! >>> 0) & 0xff;
        }

        return this;
    }

    // Returns the final hash digest.
    public digest(): Uint8Array {
        const out = new Uint8Array(this.digestLength);
        this.finish(out);
        return out;
    }

    // Internal function for use in HMAC for optimization.
    public saveState(out: Uint32Array) {
        for (let i = 0; i < this._state.length; i++) {
            out[i] = this._state[i]!;
        }
    }

    // Internal function for use in HMAC for optimization.
    public restoreState(from: Uint32Array, bytesHashed: number) {
        for (let i = 0; i < this._state.length && i < from.length; i++) {
            this._state[i] = from[i]!;
        }
        this._bytesHashed = bytesHashed;
        this.finished = false;
        this._bufferLength = 0;
    }
}

// HMAC implements HMAC-SHA256 message authentication algorithm.
export class HMAC {
    private _inner: Hash = new Hash();
    private _outer: Hash = new Hash();

    // eslint-disable-next-line @typescript-eslint/member-ordering
    public blockSize: number = this._inner.blockSize;
    // eslint-disable-next-line @typescript-eslint/member-ordering
    public digestLength: number = this._inner.digestLength;

    // Copies of hash states after keying.
    // Need for quick reset without hashing they key again.
    private _istate: Uint32Array;
    private _ostate: Uint32Array;

    constructor(key: Uint8Array) {
        const pad = new Uint8Array(this.blockSize);
        if (key.length > this.blockSize) {
            new Hash().update(key).finish(pad).clean();
        } else {
            for (let i = 0; i < key.length; i++) {
                pad[i] = key[i]!;
            }
        }
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < pad.length; i++) {
            pad[i]! ^= 0x36;
        }
        this._inner.update(pad);

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < pad.length; i++) {
            pad[i]! ^= 0x36 ^ 0x5c;
        }
        this._outer.update(pad);

        this._istate = new Uint32Array(8);
        this._ostate = new Uint32Array(8);

        this._inner.saveState(this._istate);
        this._outer.saveState(this._ostate);

        for (let i = 0; i < pad.length; i++) {
            pad[i] = 0;
        }
    }

    // Returns HMAC state to the state initialized with key
    // to make it possible to run HMAC over the other data with the same
    // key without creating a new instance.
    public reset(): this {
        this._inner.restoreState(this._istate, this._inner.blockSize);
        this._outer.restoreState(this._ostate, this._outer.blockSize);
        return this;
    }

    // Cleans HMAC state.
    public clean() {
        for (let i = 0; i < this._istate.length; i++) {
            this._ostate[i] = this._istate[i] = 0;
        }
        this._inner.clean();
        this._outer.clean();
    }

    // Updates state with provided data.
    public update(data: Uint8Array): this {
        this._inner.update(data);
        return this;
    }

    // Finalizes HMAC and puts the result in out.
    public finish(out: Uint8Array): this {
        if (this._outer.finished) {
            this._outer.finish(out);
        } else {
            this._inner.finish(out);
            this._outer.update(out, this.digestLength).finish(out);
        }
        return this;
    }

    // Returns message authentication code.
    public digest(): Uint8Array {
        const out = new Uint8Array(this.digestLength);
        this.finish(out);
        return out;
    }
}

// Returns SHA256 hash of data.
export function GetSha256Hash(data: Uint8Array): Uint8Array {
    const h = new Hash().update(data);
    const digest = h.digest();
    h.clean();
    return digest;
}

// Function hash is both available as module.hash and as default export.
export default GetSha256Hash;

// Returns HMAC-SHA256 of data under the key.
export function GetHmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
    const h = new HMAC(key).update(data);
    const digest = h.digest();
    h.clean();
    return digest;
}

// Fills hkdf buffer like this:
// T(1) = HMAC-Hash(PRK, T(0) | info | 0x01)
function FillBuffer(
    buffer: Uint8Array,
    hmac: HMAC,
    info: Uint8Array | undefined,
    counter: Uint8Array
) {
    // Counter is a byte value: check if it overflowed.
    const num = counter[0]!;

    if (num === 0) {
        throw new Error("hkdf: cannot expand more");
    }

    // Prepare HMAC instance for new data with old key.
    hmac.reset();

    // Hash in previous output if it was generated
    // (i.e. counter is greater than 1).
    if (num > 1) {
        hmac.update(buffer);
    }

    // Hash in info if it exists.
    if (info) {
        hmac.update(info);
    }

    // Hash in the counter.
    hmac.update(counter);

    // Output result to buffer and clean HMAC instance.
    hmac.finish(buffer);

    // Increment counter inside typed array, this works properly.
    counter[0]!++;
}

const hkdfSalt = new Uint8Array(digestLength); // Filled with zeroes.
export function Hkdf(key: Uint8Array, salt: Uint8Array = hkdfSalt, info?: Uint8Array, length = 32) {
    const counter = new Uint8Array([1]);

    // HKDF-Extract uses salt as HMAC key, and key as data.
    const okm = GetHmacSha256(salt, key);

    // Initialize HMAC for expanding with extracted key.
    // Ensure no collisions with `hmac` function.
    const hmac_ = new HMAC(okm);

    // Allocate buffer.
    const buffer = new Uint8Array(hmac_.digestLength);
    let bufpos = buffer.length;

    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        if (bufpos === buffer.length) {
            FillBuffer(buffer, hmac_, info, counter);
            bufpos = 0;
        }
        out[i] = buffer[bufpos++]!;
    }

    hmac_.clean();
    buffer.fill(0);
    counter.fill(0);
    return out;
}

// Derives a key from password and salt using PBKDF2-HMAC-SHA256
// with the given number of iterations.
//
// The number of bytes returned is equal to dkLen.
//
// (For better security, avoid dkLen greater than hash length - 32 bytes).
export function Pbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number, dkLen: number) {
    const prf = new HMAC(password);
    const len = prf.digestLength;
    const ctr = new Uint8Array(4);
    const t = new Uint8Array(len);
    const u = new Uint8Array(len);
    const dk = new Uint8Array(dkLen);

    for (let i = 0; i * len < dkLen; i++) {
        const c = i + 1;
        ctr[0] = (c >>> 24) & 0xff;
        ctr[1] = (c >>> 16) & 0xff;
        ctr[2] = (c >>> 8) & 0xff;
        ctr[3] = (c >>> 0) & 0xff;
        prf.reset();
        prf.update(salt);
        prf.update(ctr);
        prf.finish(u);
        for (let j = 0; j < len; j++) {
            t[j] = u[j]!;
        }
        for (let j = 2; j <= iterations; j++) {
            prf.reset();
            prf.update(u).finish(u);
            for (let k = 0; k < len; k++) {
                t[k]! ^= u[k]!;
            }
        }
        for (let j = 0; j < len && i * len + j < dkLen; j++) {
            dk[i * len + j] = t[j]!;
        }
    }
    for (let i = 0; i < len; i++) {
        t[i] = u[i] = 0;
    }
    for (let i = 0; i < 4; i++) {
        ctr[i] = 0;
    }
    prf.clean();
    return dk;
}
