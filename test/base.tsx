/** A test app's base page and app components, written the way an app writes its own. */
import { Component, hostComponent, slot, type Child, type Defaults } from '../src/index.js';

export type Category = { id: string; name: string };

export const Button = hostComponent<{ label: string; onPress: () => void }>('Button');
export const Avatar = hostComponent<{ size?: string }>('Avatar');

export class HomePage extends Component {
  Header = slot(() => <h1>{this.store.site.name}</h1>);

  RailButton = slot(({ category }: { category: Category }) => (
    <Button label={category.name} onPress={() => this.raise('rail:press', { category })} />
  ));

  Rail = slot(({ children }: { children?: (categories: readonly Category[]) => Child }) => {
    const categories = this.store.categories;
    return <nav>{children ? children(categories) : categories.map((c) => <this.RailButton key={c.id} category={c} />)}</nav>;
  });

  static defaults: Defaults<HomePage> = {
    'rail:press': (page, event) => page.action('navigate', { category: event.category.id })
  };

  render() {
    return (
      <main>
        <this.Header />
        <this.Rail />
      </main>
    );
  }
}
