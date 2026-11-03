/** A layout and pages for the ThemeRoot tests, in theme JSX (react.test.ts is plain TypeScript). */
import { Component, Layout, Outlet } from '../src/index.js';
import { Avatar } from './base.js';

export class Frame extends Layout {
  render() {
    return (
      <div className="frame">
        <Outlet />
      </div>
    );
  }
}

/** A frame with an app component that keeps state of its own, as an avatar does. */
export class AvatarFrame extends Layout {
  render() {
    return (
      <div className="frame">
        <Avatar />
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
