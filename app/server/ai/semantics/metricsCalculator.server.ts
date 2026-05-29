import prisma from "../../../db.server";

export interface MetricsSnapshot {
  startDate: Date;
  endDate: Date;
  // GMV = total_price 之和（含运费+税）
  gmv: number;
  // Net Sales = GMV - 退款金额
  netSales: number;
  orderCount: number;
  aov: number;
  // 退款率
  refundAmountRate: number;
  refundOrderRate: number;
  refundAmount: number;
  refundOrderCount: number;
  // 客户
  newCustomerCount: number;
  repeatCustomerCount: number;
  repeatCustomerRate: number;
  // 库存（实时）
  outOfStockRate: number;
  outOfStockCount: number;
  totalSkuCount: number;
}

export class MetricsCalculator {
  constructor(private shop: string) {}

  /** GMV = 统计期内下单时间的 total_price 之和（含运费+税，排除取消订单） */
  async getGmv(startDate: Date, endDate: Date): Promise<number> {
    const result = await prisma.shopOrder.aggregate({
      where: {
        shop: this.shop,
        createdAt: { gte: startDate, lt: endDate },
        status: { not: "cancelled" },
      },
      _sum: { totalPrice: true },
    });
    return result._sum.totalPrice ?? 0;
  }

  /** Net Sales = GMV - 期间内退款金额 */
  async getNetSales(startDate: Date, endDate: Date): Promise<number> {
    const gmv = await this.getGmv(startDate, endDate);
    const refundResult = await prisma.shopRefund.aggregate({
      where: {
        shop: this.shop,
        processedAt: { gte: startDate, lt: endDate },
      },
      _sum: { refundAmount: true },
    });
    const refundAmount = refundResult._sum.refundAmount ?? 0;
    return gmv - refundAmount;
  }

  /**
   * 退款率
   * - 金额口径：退款金额 / GMV
   * - 订单口径：有退款的订单数 / 总订单数
   */
  async getRefundRate(
    startDate: Date,
    endDate: Date,
  ): Promise<{ amountRate: number; orderRate: number; refundAmount: number; refundOrderCount: number; orderCount: number }> {
    const gmv = await this.getGmv(startDate, endDate);

    const [refundAgg, orderCount, refundOrderCount] = await Promise.all([
      prisma.shopRefund.aggregate({
        where: {
          shop: this.shop,
          processedAt: { gte: startDate, lt: endDate },
        },
        _sum: { refundAmount: true },
      }),
      prisma.shopOrder.count({
        where: {
          shop: this.shop,
          createdAt: { gte: startDate, lt: endDate },
          status: { not: "cancelled" },
        },
      }),
      prisma.shopOrder.count({
        where: {
          shop: this.shop,
          createdAt: { gte: startDate, lt: endDate },
          financialStatus: { in: ["partially_refunded", "refunded"] },
        },
      }),
    ]);

    const refundAmount = refundAgg._sum.refundAmount ?? 0;
    return {
      amountRate: gmv > 0 ? refundAmount / gmv : 0,
      orderRate: orderCount > 0 ? refundOrderCount / orderCount : 0,
      refundAmount,
      refundOrderCount,
      orderCount,
    };
  }

  /**
   * 复购率 = 统计期内下单且历史订单数 >= 2 的客户 / 统计期内下单客户总数
   * （新客首单在期间内但当前只有1单，则不算复购）
   */
  async getRepeatCustomerRate(
    startDate: Date,
    endDate: Date,
  ): Promise<{ rate: number; repeatCount: number; totalCount: number }> {
    const ordersInPeriod = await prisma.shopOrder.findMany({
      where: {
        shop: this.shop,
        createdAt: { gte: startDate, lt: endDate },
        status: { not: "cancelled" },
        shopifyCustomerId: { not: null },
      },
      select: { shopifyCustomerId: true },
      distinct: ["shopifyCustomerId"],
    });

    const customerIds = ordersInPeriod
      .map((o) => o.shopifyCustomerId)
      .filter(Boolean) as string[];

    if (customerIds.length === 0) {
      return { rate: 0, repeatCount: 0, totalCount: 0 };
    }

    // 历史订单数 >= 2（即在当前期间前就有至少1单）
    const repeatCustomers = await prisma.shopCustomer.count({
      where: {
        shop: this.shop,
        shopifyCustomerId: { in: customerIds },
        ordersCount: { gte: 2 },
      },
    });

    return {
      rate: customerIds.length > 0 ? repeatCustomers / customerIds.length : 0,
      repeatCount: repeatCustomers,
      totalCount: customerIds.length,
    };
  }

  /** 新客数 = 首单在统计期内的客户数 */
  async getNewCustomerCount(startDate: Date, endDate: Date): Promise<number> {
    return prisma.shopOrder.count({
      where: {
        shop: this.shop,
        createdAt: { gte: startDate, lt: endDate },
        status: { not: "cancelled" },
        isFirstOrder: true,
      },
    });
  }

  /** 缺货率 = available <= 0 的 SKU 数 / 总 SKU 数（实时快照） */
  async getOutOfStockRate(): Promise<{
    rate: number;
    oosCount: number;
    totalCount: number;
  }> {
    const [oosCount, totalCount] = await Promise.all([
      prisma.shopInventoryLevel.count({
        where: { shop: this.shop, available: { lte: 0 } },
      }),
      prisma.shopInventoryLevel.count({
        where: { shop: this.shop },
      }),
    ]);

    return {
      rate: totalCount > 0 ? oosCount / totalCount : 0,
      oosCount,
      totalCount,
    };
  }

  /** 综合快照（供经营体检报告使用） */
  async getSnapshot(startDate: Date, endDate: Date): Promise<MetricsSnapshot> {
    const [gmv, netSales, refundMetrics, repeatMetrics, newCustomerCount, oosMetrics] =
      await Promise.all([
        this.getGmv(startDate, endDate),
        this.getNetSales(startDate, endDate),
        this.getRefundRate(startDate, endDate),
        this.getRepeatCustomerRate(startDate, endDate),
        this.getNewCustomerCount(startDate, endDate),
        this.getOutOfStockRate(),
      ]);

    const aov =
      refundMetrics.orderCount > 0 ? gmv / refundMetrics.orderCount : 0;

    return {
      startDate,
      endDate,
      gmv,
      netSales,
      orderCount: refundMetrics.orderCount,
      aov,
      refundAmountRate: refundMetrics.amountRate,
      refundOrderRate: refundMetrics.orderRate,
      refundAmount: refundMetrics.refundAmount,
      refundOrderCount: refundMetrics.refundOrderCount,
      newCustomerCount,
      repeatCustomerCount: repeatMetrics.repeatCount,
      repeatCustomerRate: repeatMetrics.rate,
      outOfStockRate: oosMetrics.rate,
      outOfStockCount: oosMetrics.oosCount,
      totalSkuCount: oosMetrics.totalCount,
    };
  }
}
