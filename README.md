# Entry Lab

App para seguir precios de **Bitcoin** y **Ethereum** en tiempo real, registrar tus entradas (compras/ventas), ver ganancias y pérdidas, y obtener predicciones de mercado con IA.

---

## Para qué sirve

- **Ver precios en vivo** de BTC y ETH (vía WebSocket de Binance, sin recargar la página).
- **Gráficos de velas japonesas** por intervalo: día, semana o mes.
- **Registrar tus entradas**: precio, cantidad (BTC/ETH), fecha y hora, y lado (comprador o vendedor).
- **Seguir tu P&L**: por entrada y total, según el precio actual.
- **Predicción con IA (GPT-4o)**: análisis del mercado y de tu historial para sugerir un objetivo de precio y una línea de tendencia en el gráfico.
- **Persistencia**: las entradas se guardan en `localStorage` por activo (BTC/ETH) y sobreviven a recargas.

---

## Cómo funciona

1. **Precios en vivo**  
   Al cargar la app se abre una conexión WebSocket a Binance. Los precios de las tarjetas y el P&L de tus entradas se actualizan solos cuando llegan nuevos ticks.

2. **Gráficos**  
   Cada gráfico usa datos de la API de velas (klines) de Binance. Puedes cambiar el intervalo (Día / Semana / Mes) para ver el mismo activo en distintas escalas.

3. **Entradas**  
   En cada sección (BTC o ETH) puedes añadir entradas indicando:
   - Precio en USDT (ej. `70000` o `70k`).
   - Cantidad del activo (ej. `0.001` BTC).
   - Fecha y hora de la entrada.
   - Lado: Comprador (long) o Vendedor (short).

   Las entradas se muestran como marcadores en el gráfico y en una lista con resultado (Ganó/Perdió) y P&L en USDT.

4. **Predicción con IA**  
   El botón **“Predecir con IA”** envía a GPT-4o el historial de precios reciente y, si existen, tus entradas con resultado. La IA devuelve un precio objetivo, una dirección (alcista/bajista/lateral), confianza y una breve explicación. En el gráfico se dibuja una línea punteada de predicción y un punto en el objetivo.

5. **Aprendizaje sobre tus movimientos**  
   Si tienes entradas registradas, se envían a la IA (precio, lado, cantidad, fecha, resultado y P&L) para que el análisis tenga en cuenta tu estilo y aciertos/errores.

---

## Qué tener en cuenta

### Configuración

- **OpenAI (predicciones)**  
  La predicción con IA requiere una clave de OpenAI. Crea un archivo `.env.local` en la raíz del proyecto y añade:
  ```env
  OPENAI_API_KEY=sk-...
  ```
  Puedes usar `.env.example` como plantilla. Sin esta variable, el botón “Predecir con IA” fallará.

### Uso y limitaciones

- **Solo consulta**  
  La app no opera en ningún exchange. Solo muestra precios, gráficos y tus entradas registradas localmente. No ejecuta órdenes ni mueve fondos.

- **P&L aproximado**  
  El P&L se calcula con el precio actual y la cantidad que tú indicas. No tiene en cuenta comisiones, slippage ni cierres parciales. Sirve como referencia, no como contabilidad exacta.

- **Predicciones**  
  Las predicciones de la IA son orientativas y no constituyen asesoramiento financiero. El mercado es volátil; usa la herramienta con criterio propio.

- **Datos y conexión**  
  Precios y velas vienen de Binance. Si la conexión WebSocket o la API fallan, los precios en vivo pueden dejar de actualizarse hasta que se reconecte.

- **Almacenamiento local**  
  Las entradas se guardan solo en tu navegador (`localStorage`). Si borras datos del sitio o usas otro dispositivo/navegador, no se recuperan.

### Ejecución del proyecto

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador.
