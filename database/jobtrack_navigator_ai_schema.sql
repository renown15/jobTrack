--
-- PostgreSQL database dump
--


-- Dumped from database version 17.7 (Homebrew)
-- Dumped by pg_dump version 17.7 (Homebrew)

SELECT pg_catalog.set_config('search_path', '', false);





--
-- Name: applicantmetrichistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applicantmetrichistory (
    id integer NOT NULL,
    applicantid integer NOT NULL,
    metricdata jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: applicantmetrichistory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.applicantmetrichistory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: applicantmetrichistory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.applicantmetrichistory_id_seq OWNED BY public.applicantmetrichistory.id;



--
-- Name: llmprompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llmprompts (
    promptid integer NOT NULL,
    promptname text NOT NULL,
    promptvalue text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: llmprompts_promptid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.llmprompts_promptid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: llmprompts_promptid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.llmprompts_promptid_seq OWNED BY public.llmprompts.promptid;


--
-- Name: applicantmetrichistory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applicantmetrichistory ALTER COLUMN id SET DEFAULT nextval('public.applicantmetrichistory_id_seq'::regclass);




--
-- Name: llmprompts promptid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llmprompts ALTER COLUMN promptid SET DEFAULT nextval('public.llmprompts_promptid_seq'::regclass);


--
-- Name: llmprompts llmprompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llmprompts
    ADD CONSTRAINT llmprompts_pkey PRIMARY KEY (promptid);


--
-- Name: llmprompts llmprompts_promptname_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llmprompts
    ADD CONSTRAINT llmprompts_promptname_key UNIQUE (promptname);


--
-- Name: applicantmetrichistory_applicantid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applicantmetrichistory_applicantid_idx ON public.applicantmetrichistory USING btree (applicantid);

--
-- PostgreSQL database dump complete
--

--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';

--
-- Name: embedding_1024; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embedding_1024 (
    embeddingid integer NOT NULL,
    applicantid integer NOT NULL,
    docid text,
    content text,
    metadata jsonb,
    embedding public.vector(1024),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: embedding_1024_embeddingid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embedding_1024_embeddingid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embedding_1024_embeddingid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embedding_1024_embeddingid_seq OWNED BY public.embedding_1024.embeddingid;


--
-- Name: emeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emeddings (
    emeddingid integer NOT NULL,
    applicantid integer NOT NULL,
    docid text,
    content text,
    metadata jsonb,
    embedding public.vector(1536),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: emeddings_emeddingid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.emeddings_emeddingid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: emeddings_emeddingid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.emeddings_emeddingid_seq OWNED BY public.emeddings.emeddingid;



--
-- Name: embedding_1024 embedding_1024_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embedding_1024
    ADD CONSTRAINT embedding_1024_pkey PRIMARY KEY (embeddingid);

--
-- Name: emeddings emeddingid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emeddings ALTER COLUMN emeddingid SET DEFAULT nextval('public.emeddings_emeddingid_seq'::regclass);


--
-- Name: emeddings emeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emeddings
    ADD CONSTRAINT emeddings_pkey PRIMARY KEY (emeddingid);




--
-- Name: embedding_1024_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX embedding_1024_embedding_idx ON public.embedding_1024 USING ivfflat (embedding) WITH (lists='100');


--
-- Name: emeddings_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX emeddings_embedding_idx ON public.emeddings USING ivfflat (embedding) WITH (lists='100');


