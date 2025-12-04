import React from "react";
import "./index.css";

function App() {
  return (
    <div style={styles.container}>
      {/* Шапка */}
      <header style={styles.header}>
        <h1 style={styles.logo}>EqualTrip</h1>

        <nav style={styles.nav}>
          <a href="#" style={styles.link}>Войти</a>
          <a href="#" style={styles.link}>Регистрация</a>
          <a href="#" style={styles.link}>Мои поездки</a>
        </nav>
      </header>

      {/* Здесь позже появится Router */}
      <main style={styles.main}>
        <p>Контент будет здесь...</p>
      </main>
    </div>
  );
}

// Простые inline-стили
const styles = {
  container: {
    fontFamily: "Arial, sans-serif",
  },
  header: {
    padding: "15px 20px",
    backgroundColor: "#f0f0f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    margin: 0,
  },
  nav: {
    display: "flex",
    gap: "20px",
  },
  link: {
    textDecoration: "none",
    color: "#333",
    fontWeight: "bold",
  },
  main: {
    padding: "20px",
  },
};

export default App;