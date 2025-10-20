import React from "react";
import logo from "./logo.svg";
import "./App.css";
import Stress3D from "./Stress3D";

function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";

  // /stress3d 경로일 경우 Stress3D 컴포넌트 렌더링
  if (path === "/stress3d") {
    return <Stress3D />;
  }

  // 기존 기본 화면 유지
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a className="App-link" href="/stress3d" rel="noopener noreferrer">
          3D 렌더링 테스트로 이동
        </a>
      </header>
    </div>
  );
}

export default App;
