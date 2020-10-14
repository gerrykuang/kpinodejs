CREATE TABLE "komjudgment" (
	"judgerid" VARCHAR(12) NULL DEFAULT 'NULL::character varying',
	"rapporteur" INTEGER NULL DEFAULT '0',
	"kpiscore" INTEGER NULL DEFAULT '0',
	"makescore" INTEGER NULL DEFAULT '0',
	"contentscore" INTEGER NULL DEFAULT '0',
	"timescore" INTEGER NULL DEFAULT '0',
	"trndate" TIMESTAMP NULL DEFAULT NULL
)
;
COMMENT ON COLUMN "komjudgment"."judgerid" IS '';
COMMENT ON COLUMN "komjudgment"."rapporteur" IS '';
COMMENT ON COLUMN "komjudgment"."kpiscore" IS '';
COMMENT ON COLUMN "komjudgment"."makescore" IS '';
COMMENT ON COLUMN "komjudgment"."contentscore" IS '';
COMMENT ON COLUMN "komjudgment"."timescore" IS '';
COMMENT ON COLUMN "komjudgment"."trndate" IS '';


CREATE TABLE "komattendant" (
	"num" INTEGER NULL DEFAULT NULL,
	"empno" VARCHAR(12) NULL DEFAULT NULL,
	"ename" VARCHAR(20) NULL DEFAULT NULL,
	"cname" VARCHAR(20) NULL DEFAULT NULL,
	"deptid" VARCHAR(8) NULL DEFAULT NULL,
	"deptlevel" INTEGER NULL DEFAULT NULL,
	"status" INTEGER NULL DEFAULT '0',
	"type" INTEGER NULL DEFAULT '1'
)
;
COMMENT ON COLUMN "komattendant"."num" IS '演講順序';
COMMENT ON COLUMN "komattendant"."empno" IS '';
COMMENT ON COLUMN "komattendant"."ename" IS '';
COMMENT ON COLUMN "komattendant"."cname" IS '';
COMMENT ON COLUMN "komattendant"."deptid" IS '';
COMMENT ON COLUMN "komattendant"."deptlevel" IS '1:部級;2:廠處級';
COMMENT ON COLUMN "komattendant"."status" IS '0:未在演講 ;1:正在演講;2:演讲完成';
COMMENT ON COLUMN "komattendant"."type" IS '1:演講者;2:評委;3:皆是';


 SELECT e.cname,
    e.deptid,
    COALESCE(f.kpiscore, 0) AS "Jeffkpi",
    COALESCE(round(a.avgkpi, 2), (0)::numeric) AS avgkpi,
    COALESCE(round(b.avgmake, 2), (0)::numeric) AS avgmake,
    COALESCE(round(c.avgcontent, 2), (0)::numeric) AS avgcontent,
    round(((((COALESCE(f.kpiscore, 0))::numeric + COALESCE(a.avgkpi, (0)::numeric)) + COALESCE(b.avgmake, (0)::numeric)) + COALESCE(c.avgcontent, (0)::numeric)), 2) AS allscore
   FROM ((((komjudgment d
     LEFT JOIN ( SELECT komjudgment.rapporteur,
                CASE (count(*) - 2)
                    WHEN 0 THEN avg(komjudgment.kpiscore)
                    ELSE ((((sum(komjudgment.kpiscore) - max(komjudgment.kpiscore)) - min(komjudgment.kpiscore)) / (count(*) - 2)))::numeric
                END AS avgkpi
           FROM komjudgment
          WHERE (((komjudgment.judgerid)::text <> '8705119'::text) AND (komjudgment.kpiscore <> 0))
          GROUP BY komjudgment.rapporteur) a ON ((d.rapporteur = a.rapporteur)))
     LEFT JOIN ( SELECT komjudgment.rapporteur,
                CASE (count(*) - 2)
                    WHEN 0 THEN avg(komjudgment.makescore)
                    ELSE ((((sum(komjudgment.makescore) - max(komjudgment.makescore)) - min(komjudgment.makescore)) / (count(*) - 2)))::numeric
                END AS avgmake
           FROM komjudgment
          WHERE (komjudgment.makescore <> 0)
          GROUP BY komjudgment.rapporteur) b ON ((d.rapporteur = b.rapporteur)))
     LEFT JOIN ( SELECT komjudgment.rapporteur,
                CASE (count(*) - 2)
                    WHEN 0 THEN avg(komjudgment.contentscore)
                    ELSE ((((sum(komjudgment.contentscore) - max(komjudgment.contentscore)) - min(komjudgment.contentscore)) / (count(*) - 2)))::numeric
                END AS avgcontent
           FROM komjudgment
          WHERE (komjudgment.contentscore <> 0)
          GROUP BY komjudgment.rapporteur) c ON ((d.rapporteur = c.rapporteur)))
     LEFT JOIN ( SELECT komjudgment.rapporteur,
            komjudgment.kpiscore
           FROM komjudgment
          WHERE (((komjudgment.judgerid)::text = '8705119'::text) AND (komjudgment.kpiscore <> 0))) f ON ((d.rapporteur = f.rapporteur))),
    komattendant e
  WHERE ((d.timescore <> 0) AND (d.rapporteur = e.num));