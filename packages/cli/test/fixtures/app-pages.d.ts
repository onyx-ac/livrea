/** What the test app provides its themes, as an app's theme kit declares it. */
declare module '@app/pages' {
  import { Component } from 'livrea';
  export class HomePage extends Component {
    get title(): string;
  }
}
