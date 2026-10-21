"""Verificación rápida del motor: propiedades matemáticas y casos borde.
Ejecutar:  python test_engine.py
"""
import numpy as np
import pandas as pd

import micmac_engine as me


def test_demo():
    A, T = me.demo_matrices()
    r = me.calcular(A, T, lam=0.10, alpha_ratio=0.80)
    n = len(r.variables)
    # 1) Diagonal nula y retardo nulo donde a_ij = 0
    assert np.allclose(np.diag(r.A), 0) and np.all(r.T[r.A == 0] == 0)
    # 2) W = A * exp(-λT)
    assert np.allclose(r.W, r.A * np.exp(-0.10 * r.T))
    # 3) α ρ(|W|) = alpha_ratio  (convergencia garantizada)
    assert abs(r.alpha * me.radio_espectral(np.abs(r.W)) - 0.80) < 1e-9
    # 4) S = W (I - αW)^-1  <=>  S (I - αW) = W
    I = np.eye(n)
    assert np.allclose(r.S_bruta @ (I - r.alpha * np.abs(r.W)), np.abs(r.W))
    assert np.allclose(r.S_neta @ (I - r.alpha * r.W), r.W)
    # 5) Serie de Neumann: S = Σ α^(k-1) W^k  (comparación con 400 términos)
    P, S = r.W.copy(), r.W.copy()
    for _ in range(400):
        P = P @ r.W
        S = S + r.alpha ** (_ + 1) * P
    assert np.allclose(S, r.S_neta, atol=1e-8)
    # 6) |S_neta| <= S_bruta elemento a elemento  =>  Ω ∈ [0,100]
    assert np.all(np.abs(r.S_neta) <= r.S_bruta + 1e-9)
    ind = r.indicadores
    assert ((ind["Ambigüedad Ω (%)"] >= 0) & (ind["Ambigüedad Ω (%)"] <= 100)).all()
    assert np.allclose(ind["Bucle propio (F)"], np.diag(r.S_neta))
    # 7) M_clas / D_clas
    assert np.allclose(ind["Motricidad clásica"], np.abs(r.A).sum(axis=1))
    assert np.allclose(ind["Dependencia clásica"], np.abs(r.A).sum(axis=0))
    c = me.clasificar(ind)
    assert {"Cuadrante", "Diagnóstico", "Trampa de política"} <= set(c.columns)
    print(c[["Motricidad clásica", "Motricidad neta", "Dependencia neta", "Bucle propio (F)", "Ambigüedad Ω (%)", "Cuadrante", "Diagnóstico"]].round(3).to_string())
    print("ρ(|W|) =", round(r.rho, 4), " α =", round(r.alpha, 4))


def test_signo_cancela():
    """A→B (+3) y A→C(+3), C→B(-3): la ruta indirecta cancela parte del efecto neto."""
    n = ["A", "B", "C"]
    A = pd.DataFrame(0.0, index=n, columns=n)
    A.loc["A", "B"], A.loc["A", "C"], A.loc["C", "B"] = 3, 3, -3
    T = (A != 0).astype(float)
    r = me.calcular(A, T, lam=0.01, alpha_ratio=0.8)
    assert r.indicadores.loc["A", "Ambigüedad Ω (%)"] > 0


def test_bordes():
    n = ["A", "B"]
    Z = pd.DataFrame(0.0, index=n, columns=n)
    r = me.calcular(Z, Z)  # sin impactos: ρ = 0
    assert r.alpha == 0 and r.advertencias
    # DAG (ρ = 0 pero con impactos)
    A = Z.copy(); A.loc["A", "B"] = 2
    r = me.calcular(A, (A != 0).astype(float))
    assert r.alpha == 1.0 and r.indicadores.loc["A", "Motricidad neta"] > 0
    for malo in (0.0, 1.0, 1.5):
        try:
            me.calcular(A, A, alpha_ratio=malo); raise SystemExit("debió fallar")
        except me.MicmacError:
            pass
    B = A.copy(); B.loc["A", "B"] = 9
    try:
        me.calcular(B, A); raise SystemExit("debió fallar")
    except me.MicmacError:
        pass


if __name__ == "__main__":
    test_demo(); test_signo_cancela(); test_bordes()
    print("\nOK: todas las verificaciones del motor pasaron.")
