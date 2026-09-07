/* 近期警情类型分布（饼图）
 * 数据源：28 条模拟警情（事故/拥堵/违章/管制/故障），固定种子可复现
 * 入参 rows：SQL Server alerts 表行（DB 就绪时传入，实时反映增删改）；
 *           省略时回退本地 mock 单例（口径与入库数据一致）。
 */
import { alerts as mockAlerts } from '@/tools/mockData'
export const useRightTop = (rows) => {
      const list = rows || mockAlerts
      // 按警情类型聚合
      const byType = {}
      for (const a of list) {
            byType[a.type] = (byType[a.type] || 0) + 1
      }
      const data = Object.entries(byType).map(([type, value]) => ({ type, value }));
      const config = {
            appendPadding: 10,
            angleField: "value",
            colorField: "type",
            radius: 0.9,
            label: {
                  type: 'spider',
                  labelHeight: 28,
                  content: '{name}\n{percentage}',
                  style: {
                        /* 设置标注的颜色 */
                        fill: '#fff',
                        stroke: 'black',
                        shadowColor: '#652e80',
                        shadowBlur: 20,
                        cursor: 'pointer'
                  }
            },
            interactions: [{ type: "element-active" }],
            data,
            height: 270,
            legend: {
                  position: 'top',
                  itemName:{
                        style:{
                              fill:"#fff"
                        }
                  }
            },
      }
      return {
            people_config: config
      }
}
