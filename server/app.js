// 应用入口：创建 Express 应用、注册中间件与路由、启动服务
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { errorHandler } from './middlewares/errorHandler.js'
import skillsRouter from './routes/skills.js'
import agentRouter from './routes/agent.js'
import historyRouter from './routes/history.js'
import memoriesRouter from './routes/memories.js'
import { getPort } from './utils/config.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use('/api/skills', skillsRouter)
app.use('/api/agent', agentRouter)
app.use('/api/history', historyRouter)
app.use('/api/memories', memoriesRouter)
app.use(errorHandler)

const port = getPort()
app.listen(port)
console.log(`Server listening on http://localhost:${port}`)

export default app
