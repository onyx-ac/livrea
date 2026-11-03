/** A layout and pages for the ThemeRoot tests, in theme JSX (react.test.ts is plain TypeScript). */
import { Component, Layout, Outlet } from '../src/index.js';

export class Frame extends Layout {
  render() {
    return (
      <div className="frame">
        <Outlet />
      </div>
    );
  }
}

export class BrokenFrame extends Layout {
  render(): never {
    throw new Error('broken layout');
  }
}

export class One extends Component {
  render() {
    return <p>one</p>;
  }
}

export class Two extends Component {
  render() {
    return <p>two</p>;
  }
}

export class Broken extends Component {
  render(): never {
    throw new Error('broken page');
  }
}
