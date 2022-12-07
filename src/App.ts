export class App {
  public constructor() {
    // Nothing
  }

  public static Run(): void {
    const app = new App();
    app.Run();
  }

  private Run(): void {
    // eslint-disable-next-line no-console
    console.log('Hi there!');
  }
}