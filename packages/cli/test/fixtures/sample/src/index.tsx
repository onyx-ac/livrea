import { Component } from 'livrea';
import { HomePage } from '@app/pages';
import { settings } from './settings';

class Home extends HomePage {
  render() {
    return <h1>{this.title}</h1>;
  }
}

class About extends Component {
  render() {
    return <p>About</p>;
  }
}

export default { pages: { home: Home, about: About }, settings };
