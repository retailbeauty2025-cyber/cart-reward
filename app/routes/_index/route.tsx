import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (
    url.searchParams.get("shop") ||
    url.searchParams.get("embedded") === "1" ||
    url.searchParams.has("host") ||
    url.searchParams.has("id_token")
  ) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Cart Rewards</h1>
        <p className={styles.text}>
          Configure automatic toothbrush gifts for eligible bottle combinations.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}><li><strong>Automatic gifts</strong> at two and four eligible bottles.</li><li><strong>Kids-aware rewards</strong> select the appropriate toothbrush.</li><li><strong>Bundle exclusion</strong> keeps existing bundle products outside this reward.</li></ul>
      </div>
    </div>
  );
}
