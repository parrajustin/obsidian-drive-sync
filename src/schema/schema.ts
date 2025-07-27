/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { WrapOptional } from "../lib/option";
import * as result from "../lib/result";
import { NotFoundError, StatusError } from "../lib/status_error";
import { setAttributeOnActiveSpan } from "../logging/tracing/set-attributes-on-active-span";
import { Span } from "../logging/tracing/span.decorator";

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
        private _name: string,
        private _converters: GetConverters<Schemas>,
        private _default?: () => Schemas[0]
    ) {}

    @Span()
    public LoadData<T extends VersionedSchema<unknown, unknown>>(
        data: T | null | undefined
    ): result.Result<Schemas[MaxVersion], StatusError> {
        const dataOpt = WrapOptional<VersionedSchema<unknown, unknown>>(data);
        if (dataOpt.none) {
            return this.GetDefault();
        }
        const versionOpt = WrapOptional<number>(dataOpt.safeValue().version as number);
        if (versionOpt.none) {
            return this.GetDefault();
        }
        if (versionOpt.safeValue() < 0 || versionOpt.safeValue() > this._converters.length) {
            return this.GetDefault();
        }
        return this.LoadDataInternal(data, versionOpt.safeValue());
    }

    /**
     * Gets the default configuration of the schema.
     * @returns latest schema version
     */
    @Span()
    public GetDefault(): result.Result<Schemas[MaxVersion], StatusError> {
        const defaultFunc = WrapOptional(this._default);
        if (defaultFunc.none) {
            return result.Err(NotFoundError(`No default schema found for ${this._name}.`));
        }
        return this.LoadDataInternal(defaultFunc.safeValue()(), 0);
    }

    @Span()
    private LoadDataInternal(
        data: AnyValueInTuple<Schemas>,
        version: number
    ): AnyValueInTuple<Schemas> {
        setAttributeOnActiveSpan(`version`, version);
        if (version >= this._converters.length) {
            return data;
        }
        const converter = this._converters[version] as unknown as ConverterFunc<any, any>;
        const newData = converter(data) as AnyValueInTuple<Schemas>;
        return this.LoadDataInternal(newData, version + 1);
    }

    public GetLatestVersion(): number {
        return this._converters.length + 1;
    }
}
