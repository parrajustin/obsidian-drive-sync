export function TypeGuard<T>(_value: unknown, isMatched: boolean): _value is T {
    return isMatched;
}
