/** A paragraph keyed by its text, written in theme JSX (react.test.ts is plain TypeScript). */
export const createKeyed = (text: string) => <p key={text}>{text}</p>;
