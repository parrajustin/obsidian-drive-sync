/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { WrapOptional } from "../lib/option";

export type VersionedSchema<UnderlyingSchema, Version> = UnderlyingSchema extends {
    version: number;
}
    ? never
    : UnderlyingSchema & { version: Version };

type ConverterFunc<
    Prev extends VersionedSchema<any, any>,
    Curr extends VersionedSchema<any, any>
> = (data: Prev) => Curr;

type IncDigit = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
type Digit = IncDigit[number];

type Inc<T extends string> = T extends `${infer F}${Digit}`
    ? T extends `${F}${infer L extends Digit}`
        ? `${L extends 9 ? Inc<F> : F}${IncDigit[L]}`
        : never
    : 1;

type Increment<T extends number> = number extends T
    ? number
    : `${T}` extends `${string}${"." | "+" | "-" | "e"}${string}`
      ? number
      : Inc<`${T}`> extends `${infer N extends number}`
        ? N
        : never;

type GetConverters<
    Schemas extends any[],
    Prev extends ConverterFunc<any, any>[] = [],
    Index extends number = 0
> = Schemas extends []
    ? never
    : Schemas extends [unknown]
      ? Prev
      : Schemas extends [infer P, infer N, ...infer Tail]
        ? GetConverters<
              [N, ...Tail],
              [
                  ...Prev,
                  ConverterFunc<VersionedSchema<P, Index>, VersionedSchema<N, Increment<Index>>>
              ],
              Increment<Index>
          >
        : never;

type AnyValueInTuple<T extends readonly unknown[]> = T[number];

export class SchemaManager<Schemas extends VersionedSchema<any, any>[], MaxVersion extends number> {
    constructor(
        private _converters: GetConverters<Schemas>,
        private _default: () => Schemas[0]
    ) {}

    public loadData<T extends VersionedSchema<unknown, unknown>>(
        data: T | null | undefined
    ): Schemas[MaxVersion] {
        const dataOpt = WrapOptional<VersionedSchema<unknown, unknown>>(data);
        if (dataOpt.none) {
            return this.getDefault();
        }
        const versionOpt = WrapOptional<number>(dataOpt.safeValue().version as number);
        if (versionOpt.none) {
            return this.getDefault();
        }
        if (versionOpt.safeValue() < 0 || versionOpt.safeValue() >= this._converters.length - 1) {
            return this.getDefault();
        }
        return this.loadDataInternal(data, versionOpt.safeValue());
    }

    /**
     * Gets the default configuration of the schema.
     * @returns latest schema version
     */
    public getDefault(): Schemas[MaxVersion] {
        return this.loadDataInternal(this._default(), 0);
    }

    private loadDataInternal(
        data: AnyValueInTuple<Schemas>,
        version: number
    ): AnyValueInTuple<Schemas> {
        if (version >= this._converters.length) {
            return data;
        }
        const converter = this._converters[version] as unknown as ConverterFunc<any, any>;
        const newData = converter(data) as AnyValueInTuple<Schemas>;
        return this.loadDataInternal(newData, version + 1);
    }
}
