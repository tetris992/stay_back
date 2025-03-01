// // backend/scrapers/findOrCreatePage.js
// import logger from '../utils/logger.js';

// /**
//  * 이미 특정 도메인을 연 Page(탭)가 있으면 재사용,
//  * 없으면 새 탭을 열어 fallbackURL 로 이동
//  */
// export async function findOrCreatePage(browser, domain, fallbackURL) {
//   const pages = await browser.pages();
//   for (const pg of pages) {
//     if (pg.isClosed()) continue;
//     const url = pg.url();
//     if (url.includes(domain)) {
//       logger.info(`Reusing tab: ${url}`);
//       return pg;
//     }
//   }

//   logger.info(`No existing tab for '${domain}'. Opening new page...`);
//   const newPage = await browser.newPage();
//   await newPage.goto(fallbackURL, { waitUntil: 'networkidle0' });
//   logger.info(`Opened new tab at '${fallbackURL}'`);
//   return newPage;
// }
