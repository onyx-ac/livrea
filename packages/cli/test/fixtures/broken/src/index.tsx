import { HomePage } from '@app/pages';

class Home extends HomePage {
  render() {
    const count: number = 'not a number';
    return <h1>{count}</h1>;
  }
}

export default { pages: { home: Home } };
