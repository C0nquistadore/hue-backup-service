export class App {
  public constructor() {
  }

  public static Run(): void {
    const app = new App();
    app.Run();
  }

  private Run(): void {
    console.log('Hi there!');
  }
}